import type { fetchWithTimeout } from '@modules/utils/http'

export const ROBOTS_PUBLIC_ADDRESSES = [{ address: '93.184.216.34', family: 4 as const }]

/** SSRF validation result for a public robots.txt host, without a DNS lookup. */
export async function resolvePublicRobotsAddresses() {
  return ROBOTS_PUBLIC_ADDRESSES
}

/** Wraps a canned response in the pinned transport's `fetchWithTimeout` result shape. */
export function pinnedRobotsFetchResult(
  response: object,
): Awaited<ReturnType<typeof fetchWithTimeout>> {
  return { response: response as Response, responseSignal: new AbortController().signal }
}
