import type {
  ContentCreationChannel,
  PublicContentProvenance,
  StaffContentProvenance,
} from '@voucha/types/entities/content-provenance'
import {
  getOAuthClientDisplayName,
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
 * The public label for one created row, or null when the channel is never labeled publicly.
 *
 * Only `api` and `mcp` rows are labeled. The app name follows four tiers:
 * 1. a CIMD client whose `metadata_url` is on the reviewed allowlist gets the reviewed name;
 * 2. any other CIMD client gets its `metadata_url` hostname;
 * 3. a dynamically registered client that staff verified gets its `client_name`;
 * 4. everything else is plain "via API" or "via MCP" (`app_name` null).
 */
export function resolvePublicProvenanceLabel(
  createdVia: ContentCreationChannel,
  client: ProvenanceClient | null | undefined,
  knownClients: KnownOAuthClients = KNOWN_OAUTH_CLIENTS,
): PublicContentProvenance | null {
  if (createdVia !== 'api' && createdVia !== 'mcp') return null
  if (!client) return { via: createdVia, app_name: null }
  if (client.metadata_url) {
    return {
      via: createdVia,
      app_name: getOAuthClientDisplayName(client.metadata_url, knownClients),
    }
  }
  return { via: createdVia, app_name: client.verified_at ? client.client_name : null }
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
