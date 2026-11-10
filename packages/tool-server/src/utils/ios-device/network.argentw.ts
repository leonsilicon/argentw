import * as crypto from "node:crypto";
import * as fs from "node:fs";
import net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { readDeviceLink } from "./devicectl";
import { openUsbmuxRunnerSocket } from "./usbmux";
import { IosDeviceTransportError } from "./usbmux-protocol";

/**
 * argentw: drive a physical iPhone without a cable.
 *
 * Upstream argent drives only a cabled iPhone: usbmux carries each command to
 * a runner bound to the phone's loopback. A paired iPhone on the same network
 * as the Mac is reachable through CoreDevice instead (transportType
 * "localNetwork"), which keeps an encrypted, pairing-authenticated tunnel to
 * it and gives the phone an address inside that tunnel.
 *
 * argentw starts the runner with this Mac's token. The runner then listens
 * beyond loopback and refuses any request without the token, and commands go
 * to the tunnel address whenever the phone has no cable. A cabled phone keeps
 * upstream's usbmux path.
 */

export interface DeviceLink {
  transportType: string | null;
  tunnelState: string | null;
  tunnelIPAddress: string | null;
}

const links = new Map<string, DeviceLink>();

/** Remember how CoreDevice last reached the device, for the next runner command. */
export function recordDeviceLink(udid: string, link: DeviceLink): void {
  links.set(udid, link);
}

/** On the network, not a cable, with the tunnel up and an address to dial. */
export function isWirelessLink(link: DeviceLink): boolean {
  return (
    link.transportType != null &&
    link.transportType !== "wired" &&
    link.tunnelState === "connected" &&
    link.tunnelIPAddress != null
  );
}

/** Upstream lists only a cabled phone as connected. A phone on the network counts too. */
export function isReachableTransport(
  transportType: string | null,
  tunnelState: string | null
): boolean {
  if (transportType === "wired") {
    return true;
  }

  // Upstream live-verified that a paired iPhone with the cable pulled reads "localNetwork"
  // with its tunnel "connected" while CoreDevice still reaches it. "disconnected" also
  // covers a phone last seen days ago, so it stays "paired".
  return transportType === "localNetwork" && tunnelState === "connected";
}

/**
 * Whether runner commands go through the tunnel: always when the phone has no cable.
 * With ARGENTW_TRANSPORT=tunnel in the tool-server's environment, a cabled phone's
 * commands go through the tunnel too (CoreDevice runs the same tunnel over USB), which
 * tests the wireless path without a network the phone and Mac share.
 */
function usesTunnel(link: DeviceLink): boolean {
  if (isWirelessLink(link)) {
    return true;
  }

  return (
    process.env.ARGENTW_TRANSPORT === "tunnel" &&
    link.tunnelState === "connected" &&
    link.tunnelIPAddress != null
  );
}

/**
 * Open a paused socket to the runner's port, through the tunnel when the phone
 * has no cable and through usbmux when it does.
 */
export async function openRunnerSocket(options: {
  udid: string;
  port: number;
  timeoutMs: number;
}): Promise<net.Socket> {
  const startedAt = Date.now();
  const remainingMs = () => Math.max(1, options.timeoutMs - (Date.now() - startedAt));

  let link = links.get(options.udid);

  // A tool-server that hasn't read this device yet must not guess usbmux: usbmuxd can
  // also list a phone on the network, and that path would bypass the encrypted tunnel.
  if (link == null) {
    link = await readDeviceLink(options.udid);
  }

  if (!usesTunnel(link)) {
    return openUsbmuxRunnerSocket({ ...options, timeoutMs: remainingMs() });
  }

  try {
    return await dialTunnel(link.tunnelIPAddress!, options.port, remainingMs());
  } catch (error) {
    // The cable went in or the tunnel was rebuilt since the last read. Read the link
    // again and follow it once.
    const fresh = await readDeviceLink(options.udid);

    if (!usesTunnel(fresh)) {
      return openUsbmuxRunnerSocket({ ...options, timeoutMs: remainingMs() });
    }

    if (fresh.tunnelIPAddress === link.tunnelIPAddress) {
      throw error;
    }

    return dialTunnel(fresh.tunnelIPAddress!, options.port, remainingMs());
  }
}

const WIRELESS_HINT =
  "Keep the iPhone unlocked and on the same network as this Mac, or connect it by cable, and retry.";

function dialTunnel(address: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: address, port });

    const fail = (error: IosDeviceTransportError) => {
      socket.destroy();
      reject(error);
    };

    const timer = setTimeout(
      () =>
        fail(
          new IosDeviceTransportError(
            "timeout",
            `Timed out reaching the runner at [${address}]:${port} over the CoreDevice tunnel`,
            { retryable: true, hint: WIRELESS_HINT }
          )
        ),
      timeoutMs
    );

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.removeAllListeners("error");
      // Paused like a usbmux socket: postRunnerCommand resumes it once the request is out.
      socket.pause();
      resolve(socket);
    });

    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      fail(
        error.code === "ECONNREFUSED"
          ? new IosDeviceTransportError(
              "runner-not-listening",
              `XCUITest runner is not listening on device port ${port}`,
              { retryable: true, cause: error }
            )
          : new IosDeviceTransportError(
              "device-unattached",
              `Could not reach the iPhone at [${address}] over the CoreDevice tunnel (${error.code ?? error.message})`,
              { retryable: false, hint: WIRELESS_HINT, cause: error }
            )
      );
    });
  });
}

/** Header carrying the token on every runner command. */
export const ARGENTW_TOKEN_HEADER = "X-Argentw-Token";

let token: string | null = null;

/**
 * This Mac's runner token: 32 random bytes, hex, created once and kept 0600 in
 * ~/.argent/argentw-token. The runner receives it in its launch environment, so it
 * never crosses the network except inside the tunnel or the cable.
 */
export function argentwToken(): string {
  if (token != null) {
    return token;
  }

  const file = path.join(os.homedir(), ".argent", "argentw-token");

  try {
    const existing = fs.readFileSync(file, "utf8").trim();

    if (/^[0-9a-f]{64}$/.test(existing)) {
      token = existing;
      return token;
    }
  } catch {
    // Missing or unreadable: create it below.
  }

  const created = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${created}\n`, { mode: 0o600 });
  token = created;
  return token;
}

/** Environment for xcodebuild. It forwards TEST_RUNNER_* to the runner without the prefix. */
export function argentwRunnerEnvironment(): NodeJS.ProcessEnv {
  return { ...process.env, TEST_RUNNER_ARGENTW_TOKEN: argentwToken() };
}
