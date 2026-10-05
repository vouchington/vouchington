import type {
  ContentCreationChannel,
  PublicContentProvenance,
  StaffContentProvenance,
} from '@voucha/types/entities/content-provenance'
import {
  getKnownOAuthClient,
  KNOWN_OAUTH_CLIENTS,
  type KnownOAuthClients,
} from '@services/oauth-authorization-server/known-clients'

/** The `oauth_clients` columns the label rules read. `metadata_url` is set only for CIMD clients. */
export type ProvenanceClient = {
  client_id: string
  client_name: string
  metadata_url: string | null
  verified_at: Date | string | null
}

/**
 * The public provenance facts for one created row, or null when the channel is never labeled
 * publicly. The response carries codes, keys and ids; each client composes the wording.
 *
 * Only `api` and `mcp` rows are labeled. The `app` follows four tiers:
 * 1. a CIMD client whose `metadata_url` is on the reviewed allowlist is `known`, by its key;
 * 2. any other CIMD client is a `hostname`, its `metadata_url` hostname;
 * 3. a dynamically registered client that staff verified is `verified`, with its id and name;
 * 4. everything else is plain "via API" or "via MCP" (`app` null).
 */
export function resolvePublicProvenanceLabel(
  createdVia: ContentCreationChannel,
  client: ProvenanceClient | null | undefined,
  knownClients: KnownOAuthClients = KNOWN_OAUTH_CLIENTS,
): PublicContentProvenance | null {
  if (createdVia !== 'api' && createdVia !== 'mcp') return null
  if (!client) return { via: createdVia, app: null }
  if (client.metadata_url) {
    const known = getKnownOAuthClient(client.metadata_url, knownClients)
    return {
      via: createdVia,
      app: known
        ? { kind: 'known', key: known.key }
        : { kind: 'hostname', hostname: new URL(client.metadata_url).hostname },
    }
  }
  return {
    via: createdVia,
    app: client.verified_at
      ? { kind: 'verified', client_id: client.client_id, client_name: client.client_name }
      : null,
  }
}

/** The raw record moderation staff see: every channel plus the OAuth client, unmodified. */
export function buildStaffProvenance(
  createdVia: ContentCreationChannel,
  client: ProvenanceClient | null | undefined,
): StaffContentProvenance {
  return {
    created_via: createdVia,
    oauth_client: client
      ? {
          client_id: client.client_id,
          client_name: client.client_name,
          metadata_url: client.metadata_url,
          verified: client.verified_at != null,
        }
      : null,
  }
}
