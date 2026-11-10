import * as fs from "node:fs";
import net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// argentw: the runner transport for an iPhone without a cable.

const fake = vi.hoisted(() => ({
  home: "",
  link: {
    transportType: "localNetwork" as string | null,
    tunnelState: "connected" as string | null,
    tunnelIPAddress: "127.0.0.1" as string | null,
  },
  usbmuxCalls: 0,
}));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => fake.home };
});

vi.mock("../src/utils/ios-device/devicectl", () => ({
  readDeviceLink: async (udid: string) => {
    const { recordDeviceLink } = await import("../src/utils/ios-device/network.argentw");
    recordDeviceLink(udid, { ...fake.link });
    return { ...fake.link };
  },
}));

vi.mock("../src/utils/ios-device/usbmux", () => ({
  openUsbmuxRunnerSocket: async () => {
    fake.usbmuxCalls += 1;
    throw new Error("usbmux path");
  },
}));

const {
  argentwRunnerEnvironment,
  argentwToken,
  isReachableTransport,
  isWirelessLink,
  openRunnerSocket,
  recordDeviceLink,
} = await import("../src/utils/ios-device/network.argentw");

beforeAll(() => {
  fake.home = fs.mkdtempSync(path.join(os.tmpdir(), "argentw-home-"));
});

afterEach(() => {
  fake.usbmuxCalls = 0;
  fake.link = {
    transportType: "localNetwork",
    tunnelState: "connected",
    tunnelIPAddress: "127.0.0.1",
  };
});

describe("isWirelessLink", () => {
  it("needs a non-wired transport, a connected tunnel and its address", () => {
    expect(
      isWirelessLink({
        transportType: "localNetwork",
        tunnelState: "connected",
        tunnelIPAddress: "fd00::1",
      })
    ).toBe(true);
    expect(
      isWirelessLink({
        transportType: "wired",
        tunnelState: "connected",
        tunnelIPAddress: "fd00::1",
      })
    ).toBe(false);
    expect(
      isWirelessLink({
        transportType: "localNetwork",
        tunnelState: "disconnected",
        tunnelIPAddress: "fd00::1",
      })
    ).toBe(false);
    expect(
      isWirelessLink({
        transportType: "localNetwork",
        tunnelState: "connected",
        tunnelIPAddress: null,
      })
    ).toBe(false);
  });
});

describe("isReachableTransport", () => {
  it("counts a cable, or the network with the tunnel up", () => {
    expect(isReachableTransport("wired", null)).toBe(true);
    expect(isReachableTransport("localNetwork", "connected")).toBe(true);
    expect(isReachableTransport("localNetwork", "disconnected")).toBe(false);
    expect(isReachableTransport(null, "unavailable")).toBe(false);
  });
});

describe("openRunnerSocket", () => {
  it("dials the tunnel address when the phone has no cable", async () => {
    const server = net.createServer((socket) => socket.end("pong"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as net.AddressInfo).port;

    try {
      const socket = await openRunnerSocket({ udid: "WIRELESS-1", port, timeoutMs: 2_000 });
      // Handed over paused, like a usbmux socket.
      expect(socket.isPaused()).toBe(true);
      socket.resume();
      const [data] = (await new Promise((resolve) => socket.once("data", (d) => resolve([d])))) as [
        Buffer,
      ];
      expect(data.toString()).toBe("pong");
      socket.destroy();
      expect(fake.usbmuxCalls).toBe(0);
    } finally {
      server.close();
    }
  });

  it("keeps usbmux for a cabled phone", async () => {
    fake.link = { transportType: "wired", tunnelState: "connected", tunnelIPAddress: "fd00::1" };
    await expect(openRunnerSocket({ udid: "WIRED-1", port: 1, timeoutMs: 500 })).rejects.toThrow(
      "usbmux path"
    );
    expect(fake.usbmuxCalls).toBe(1);
  });

  it("follows the cable when the tunnel fails and the phone is now wired", async () => {
    recordDeviceLink("SWITCHED-1", {
      transportType: "localNetwork",
      tunnelState: "connected",
      tunnelIPAddress: "127.0.0.1",
    });
    fake.link = { transportType: "wired", tunnelState: "connected", tunnelIPAddress: "fd00::1" };

    // Nothing listens on port 1, so the tunnel dial is refused and the link is read again.
    await expect(openRunnerSocket({ udid: "SWITCHED-1", port: 1, timeoutMs: 500 })).rejects.toThrow(
      "usbmux path"
    );
    expect(fake.usbmuxCalls).toBe(1);
  });

  it("reports a closed runner port as retryable", async () => {
    await expect(
      openRunnerSocket({ udid: "WIRELESS-2", port: 1, timeoutMs: 500 })
    ).rejects.toMatchObject({ kind: "runner-not-listening", retryable: true });
  });
});

describe("argentwToken", () => {
  it("creates one 0600 token per Mac and reuses it", () => {
    const token = argentwToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const file = path.join(fake.home, ".argent", "argentw-token");
    expect(fs.readFileSync(file, "utf8").trim()).toBe(token);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);

    expect(argentwToken()).toBe(token);
    expect(argentwRunnerEnvironment().TEST_RUNNER_ARGENTW_TOKEN).toBe(token);
  });
});
