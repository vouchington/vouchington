export type KnownOAuthClient = {
  /** Lowercase slug a public API exposes. Each client keeps its display copy for the key. */
  key: string
  /** The name the consent screen and the connected-apps list show. Never a public API field. */
  name: string
}

export type KnownOAuthClients = Readonly<Record<string, KnownOAuthClient>>

// Exact CIMD URLs are added only after the key, display name and document URL are reviewed
// together. An entry also needs the key's display copy in the web localization catalog (see
// `web/components/posts/known-app-name-keys.ts`) and, later, in the native catalogs.
export const KNOWN_OAUTH_CLIENTS = {} as const satisfies KnownOAuthClients

const KEY_SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** Whether `key` is a lowercase slug: letters and digits, with single hyphens between words. */
export function isKnownOAuthClientKey(key: string): boolean {
  return KEY_SLUG_PATTERN.test(key)
}

export function getKnownOAuthClient(
  metadataUrl: string,
  knownClients: KnownOAuthClients = KNOWN_OAUTH_CLIENTS,
): KnownOAuthClient | null {
  return knownClients[metadataUrl] ?? null
}

export function getOAuthClientDisplayName(
  metadataUrl: string,
  knownClients: KnownOAuthClients = KNOWN_OAUTH_CLIENTS,
): string {
  return getKnownOAuthClient(metadataUrl, knownClients)?.name ?? new URL(metadataUrl).hostname
}
