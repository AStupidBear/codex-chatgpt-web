import { expect, test } from "bun:test";
import { extractRemoteCdpWebSocket, remoteCdpCandidates, validateRemoteCdpUrl } from "../src/adapters/chatgpt-web/remote-cdp";

test("remote CDP validates HTTP and WebSocket URLs without exposing embedded credentials", () => {
  expect(validateRemoteCdpUrl("http://cnode01:8080/api/profiles/abc/cdp")).toBe("http://cnode01:8080/api/profiles/abc/cdp");
  expect(validateRemoteCdpUrl("wss://private.example/cdp")).toBe("wss://private.example/cdp");
  expect(() => validateRemoteCdpUrl("file:///tmp/socket")).toThrow();
  expect(() => validateRemoteCdpUrl("http://user:pass@cnode01:8080/cdp")).toThrow();
});
test("remote CDP resolves websocket-only CloakBrowser endpoints and JSON discovery", () => {
  const input = "http://cnode01:8080/api/profiles/abc/cdp";
  expect(remoteCdpCandidates(input)).toEqual([input, "ws://cnode01:8080/api/profiles/abc/cdp"]);
  expect(extractRemoteCdpWebSocket({ data: { webSocketDebuggerUrl: "ws://cnode01:8080/proxy?token=abc" } }))
    .toBe("ws://cnode01:8080/proxy?token=abc");
  expect(remoteCdpCandidates(input, "ws://cnode01:8080/proxy")).toEqual([
    "ws://cnode01:8080/proxy", input, "ws://cnode01:8080/api/profiles/abc/cdp",
  ]);
  expect(extractRemoteCdpWebSocket({ ok: true })).toBeUndefined();
});
