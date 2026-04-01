import { ProxyAgent, fetch as undiciFetch } from "undici";

/**
 * fetch() wrapper that routes through FIXIE_URL proxy when set.
 * This gives outbound requests a static IP for API whitelist requirements (e.g. Sono).
 */
export function proxyFetch(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<Response> {
  const proxyUrl = process.env.FIXIE_URL;
  if (proxyUrl) {
    const dispatcher = new ProxyAgent(proxyUrl);
    return undiciFetch(url, { ...init, dispatcher }) as unknown as Promise<Response>;
  }
  return fetch(url, init);
}
