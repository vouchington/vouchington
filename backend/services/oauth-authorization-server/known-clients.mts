export type KnownOAuthClients = Readonly<Record<string, string>>

// Exact CIMD URLs are added only after the display name and document URL are reviewed together.
export const KNOWN_OAUTH_CLIENTS = {} as const satisfies KnownOAuthClients

export function getOAuthClientDisplayName(
  metadataUrl: string,
  knownClients: KnownOAuthClients = KNOWN_OAUTH_CLIENTS,
): string {
  return knownClients[metadataUrl] ?? new URL(metadataUrl).hostname
}
