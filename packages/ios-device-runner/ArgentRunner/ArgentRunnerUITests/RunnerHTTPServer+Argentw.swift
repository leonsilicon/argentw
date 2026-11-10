import Foundation

/// argentw: lets the Mac reach the runner without a cable.
///
/// Upstream binds the listener to loopback, which only a usbmux stream over
/// the cable reaches. A phone on the network is reached through CoreDevice's
/// encrypted tunnel instead, which arrives on another interface. When the host
/// passes a token (TEST_RUNNER_ARGENTW_TOKEN, forwarded by xcodebuild without
/// the prefix), the listener also accepts connections beyond loopback, and
/// every request must carry that token or it is refused before dispatch.
/// Without a token the runner behaves exactly like upstream's.
enum ArgentwNetwork {
    static let token: String? = {
        guard
            let raw = ProcessInfo.processInfo.environment["ARGENTW_TOKEN"],
            raw.utf8.count >= 32
        else {
            return nil
        }
        return raw
    }()

    /// Whether the listener may accept connections beyond loopback.
    static var listensBeyondLoopback: Bool { token != nil }

    /// Whether the request's header block carries the token. Always true
    /// without a token, which keeps upstream's loopback-only behavior.
    static func authorizes(_ request: Data) -> Bool {
        guard let token else { return true }

        guard
            let end = request.range(of: Data("\r\n\r\n".utf8)),
            let head = String(data: request[..<end.lowerBound], encoding: .utf8)
        else {
            return false
        }

        // "\r\n" is a single Character in Swift, so this splits on line ends.
        for line in head.split(separator: "\r\n").dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = line[..<colon].trimmingCharacters(in: .whitespaces)

            if name.lowercased() == "x-argentw-token" {
                let value = line[line.index(after: colon)...]
                    .trimmingCharacters(in: .whitespaces)
                return constantTimeEquals(value, token)
            }
        }

        return false
    }

    static func unauthorizedBody() -> Data {
        Data(
            #"{"ok":false,"error":{"code":"INVALID_REQUEST","message":"request lacks this Mac's argentw token"}}"#
                .utf8
        )
    }

    private static func constantTimeEquals(_ a: String, _ b: String) -> Bool {
        let x = Array(a.utf8)
        let y = Array(b.utf8)
        guard x.count == y.count else { return false }

        var difference: UInt8 = 0
        for index in x.indices {
            difference |= x[index] ^ y[index]
        }
        return difference == 0
    }
}
