/**
 * Outbound HTTP for providers that IP-whitelist merchants (e.g. Sono / Rico).
 *
 * Use **Vercel Static IPs** on this project (Dashboard → Settings → Connectivity → Static IPs).
 * When enabled, Serverless Function traffic to external APIs uses Vercel’s allowlisted static egress IPs.
 *
 * @see https://vercel.com/docs/connectivity/static-ips
 */
export function proxyFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, init);
}
