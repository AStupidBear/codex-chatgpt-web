import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { assertAuthenticatedChatGptPage, chatGptNewChatUrl, detectChatGptAccountCapabilities } from "../../chatgpt-session";

/**
 * Attach to an already-running Chromium profile. We never launch a browser,
 * create an incognito context, copy cookies, or close unowned tabs.
 * CloakBrowser gateways may return a websocket endpoint from an HTTP API.
 */
export function validateRemoteCdpUrl(value: string): string {
  if (typeof value !== "string" || value.length > 4096) throw new Error("Remote CDP URL is invalid");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Remote CDP URL must be absolute"); }
  if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)
    || !url.hostname || url.username || url.password || url.hash) {
    throw new Error("Remote CDP URL must be an HTTP(S) or WS(S) URL without embedded credentials or fragment");
  }
  return url.toString();
}

export function extractRemoteCdpWebSocket(json: unknown): string | undefined {
  if (!json || typeof json !== "object" || Array.isArray(json)) return undefined;
  const record = json as Record<string, unknown>;
  for (const key of ["webSocketDebuggerUrl", "websocketUrl", "wsEndpoint", "wsUrl", "cdpUrl"]) {
    const value = record[key];
    if (typeof value === "string") {
      try {
        const parsed = new URL(value);
        if (parsed.protocol === "ws:" || parsed.protocol === "wss:") return validateRemoteCdpUrl(value);
      } catch { /* Not a websocket endpoint. */ }
    }
  }
  if (record.data && typeof record.data === "object") return extractRemoteCdpWebSocket(record.data);
  return undefined;
}

export function remoteCdpCandidates(address: string, advertised?: string): string[] {
  const url = new URL(validateRemoteCdpUrl(address));
  const endpoints = advertised ? [validateRemoteCdpUrl(advertised)] : [];
  endpoints.push(url.toString());
  if (url.protocol === "http:" || url.protocol === "https:") {
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    endpoints.push(url.toString());
  }
  return [...new Set(endpoints)];
}

/** Network probe is intentionally read-only and does not contact alternate hosts. */
async function discoverRemoteCdpWebSocket(address: string): Promise<string | undefined> {
  const url = new URL(validateRemoteCdpUrl(address));
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal, redirect: "error" });
    if (!response.ok) return undefined;
    if (!response.headers.get("content-type")?.includes("json")) return undefined;
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > 64_000) return undefined;
    const text = await response.text();
    if (text.length > 64_000) return undefined;
    return extractRemoteCdpWebSocket(JSON.parse(text));
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export async function connectRemoteCdp(address: string): Promise<{ browser: Browser; context: BrowserContext }> {
  validateRemoteCdpUrl(address);
  const discovered = await discoverRemoteCdpWebSocket(address);
  const candidates = remoteCdpCandidates(address, discovered);
  let failure: unknown;
  for (const endpoint of candidates) {
    let browser: Browser | undefined;
    try {
      browser = await chromium.connectOverCDP(endpoint, { timeout: 12_000, noDefaults: true });
      // The existing default context holds the CloakBrowser profile's real cookies.
      const context = browser.contexts()[0];
      if (!context) throw new Error("Remote browser exposed no persistent default context");
      return { browser, context };
    } catch (error) {
      failure = error;
      await browser?.close().catch(() => {});
    }
  }
  // Do not expose access tokens embedded in a CloakBrowser discovery websocket.
  throw new Error("Remote CDP connection failed; verify the CloakBrowser profile is running and its CDP URL is reachable", { cause: failure });
}

export async function inspectRemoteCdp(address: string, detectCapabilities = false): Promise<{
  browserVersion: string;
  authenticated: true;
  solAvailable?: boolean;
  extraHighAvailable?: boolean;
  proAvailable?: boolean;
}> {
  const { browser, context } = await connectRemoteCdp(address);
  let page: Awaited<ReturnType<BrowserContext["newPage"]>> | undefined;
  try {
    page = await context.newPage();
    await page.goto(chatGptNewChatUrl(), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("[data-testid='prompt-textarea'], #prompt-textarea, [contenteditable='true'][data-lexical-editor='true']").first().waitFor({ state: "visible", timeout: 30_000 });
    await assertAuthenticatedChatGptPage(page);
    const capabilities = detectCapabilities ? await detectChatGptAccountCapabilities(page) : undefined;
    return {
      browserVersion: browser.version(),
      authenticated: true,
      ...(capabilities ? {
        solAvailable: capabilities.solAvailable,
        extraHighAvailable: capabilities.extraHighAvailable,
        proAvailable: capabilities.proAvailable,
      } : {}),
    };
  } finally {
    await page?.close().catch(() => {});
    // connectOverCDP Browser.close disconnects the local Playwright transport.
    await browser.close().catch(() => {});
  }
}
