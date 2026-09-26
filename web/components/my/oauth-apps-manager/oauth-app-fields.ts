/** Mirrors the backend limits so the form blocks submissions the API would reject. */
export const MAX_CLIENT_NAME_LENGTH = 120
export const MAX_REDIRECT_URIS = 10

/** One redirect URI per line; blank lines and repeats are dropped because the API rejects duplicates. */
export function parseRedirectUris(text: string): string[] {
  return [
    ...new Set(
      text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== ''),
    ),
  ]
}

export function hasValidOAuthAppDetails(name: string, redirectUris: readonly string[]): boolean {
  return name.trim() !== '' && redirectUris.length > 0 && redirectUris.length <= MAX_REDIRECT_URIS
}
