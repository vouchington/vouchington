import { getOAuthIssuer } from './resources.mts'

// Every authorization response, success or error, carries the RFC 9207 `iss` parameter so a
// client talking to several authorization servers can reject a mixed-up response.
export function buildOAuthAuthorizationResponseUrl(
  redirectUri: string,
  parameters: Record<string, string>,
): string {
  const redirect = new URL(redirectUri)
  for (const [name, value] of Object.entries(parameters)) redirect.searchParams.set(name, value)
  redirect.searchParams.set('iss', getOAuthIssuer())
  return redirect.toString()
}
