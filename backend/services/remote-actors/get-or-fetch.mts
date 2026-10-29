import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { normalizeHostname } from '@ts-shared/utils/urls'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import {
  fetchRemoteActorDocument,
  RemoteActorFetchAvailabilityError,
  type RemoteActorDocument,
  type FetchRemoteActorDocumentDeps,
} from './fetch-remote-actor-document.mts'

export interface RemoteActorRow {
  id: string
  actor_uri: string
  key_id: string
  public_key_pem: string
  inbox_url: string
  shared_inbox_url: string | null
  fetched_at: Date
  created_at: Date
  updated_at: Date
  hostname_id: string | null
}

const REMOTE_ACTOR_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const REMOTE_ACTOR_STALE_KEY_FALLBACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

function isFresh(row: RemoteActorRow, now: () => number): boolean {
  return getCacheAgeMs(row, now) < REMOTE_ACTOR_CACHE_TTL_MS
}

function canFallBackToStaleKey(row: RemoteActorRow, now: () => number): boolean {
  return getCacheAgeMs(row, now) < REMOTE_ACTOR_STALE_KEY_FALLBACK_MAX_AGE_MS
}

function getCacheAgeMs(row: RemoteActorRow, now: () => number): number {
  const nowMs = now()
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('Remote actor cache clock must return a finite timestamp')
  }
  return nowMs - row.fetched_at.getTime()
}

export async function getRemoteActorByKeyId(keyId: string): Promise<RemoteActorRow | null> {
  const { rows } = await read(sql`/* getRemoteActorByKeyId */
    SELECT actor.id, identity.actor_uri, actor.key_id, actor.public_key_pem,
           actor.inbox_url, actor.shared_inbox_url, actor.fetched_at, actor.created_at,
           actor.updated_at, actor.hostname_id
    FROM remote_actors actor
    JOIN remote_actor_identities identity ON identity.id = actor.id
    WHERE actor.key_id = ${keyId}
      AND actor.deleted_at IS NULL
    LIMIT 1
  `)
  return (rows[0] as RemoteActorRow) ?? null
}

// DB-only lookup for a previously verified durable inbox checkpoint. Inactive actors are terminal:
// retaining a delivery must never trigger a network refetch that could substitute a new identity.
export async function getCheckpointedRemoteActorByIdFromPrimary(
  id: string,
): Promise<RemoteActorRow | null> {
  const { rows } = await write(sql`/* getCheckpointedRemoteActorByIdFromPrimary */
    SELECT actor.id, identity.actor_uri, actor.key_id, actor.public_key_pem,
           actor.inbox_url, actor.shared_inbox_url, actor.fetched_at, actor.created_at,
           actor.updated_at, actor.hostname_id
    FROM remote_actors actor
    JOIN remote_actor_identities identity ON identity.id = actor.id
    WHERE actor.id = ${id} AND actor.deleted_at IS NULL
    LIMIT 1
  `)
  return (rows[0] as RemoteActorRow) ?? null
}

// Read-only lookup — never creates a url_hostnames row. Only instances already added to the
// fediverse directory (@services/fediverse-instances) resolve to a hostname_id; unknown remote
// hosts stay NULL rather than being enrolled as crawlable via upsertUrlHostnames (which the
// directory's own creation path intentionally does — see fediverse-federation.md Phase B).
async function lookupHostnameId(actorUri: string): Promise<string | null> {
  const hostname = normalizeHostname(actorUri)
  if (!hostname) return null
  const row = await getUrlHostnameByAny(hostname)
  return row?.id ?? null
}

// Looks up a cached remote actor by the HTTP Signature `keyId`, fetching and persisting it on
// first sight, and refetching once the cached row goes stale (REMOTE_ACTOR_CACHE_TTL_MS) so a
// remote server's rotated key is eventually picked up rather than cached forever. The actor URI is
// derived by stripping the keyId's fragment (the common `<actorUri>#main-key` convention) — the
// fetched document's own publicKey.id is then required to match the requested keyId exactly, and
// its own id is required to match the derived actor URI, so a mismatched or spoofed keyId, or a
// document that claims a different actor's identity, is rejected rather than silently cached under
// the wrong identity.
export async function getOrFetchRemoteActorByKeyId(
  keyId: string,
  fetchDeps?: FetchRemoteActorDocumentDeps,
  now: () => number = Date.now,
): Promise<RemoteActorRow> {
  const existing = await getRemoteActorByKeyId(keyId)
  if (existing && isFresh(existing, now)) return existing

  const actorUri = deriveActorUriFromKeyId(keyId)
  let document: RemoteActorDocument
  try {
    document = fetchDeps
      ? await fetchRemoteActorDocument(actorUri, fetchDeps)
      : await fetchRemoteActorDocument(actorUri)
  } catch (err) {
    if (err instanceof RemoteActorFetchAvailabilityError) {
      if (existing && canFallBackToStaleKey(existing, now)) return existing
    }
    throw err
  }

  if (document.keyId !== keyId) {
    throw createHttpError(
      422,
      "Remote actor document's publicKey.id does not match the requested keyId",
    )
  }
  if (document.actorUri !== actorUri) {
    throw createHttpError(422, "Remote actor document's id does not match the fetched actor URI")
  }
  return upsertRemoteActor(document)
}

function deriveActorUriFromKeyId(keyId: string): string {
  let url: URL
  try {
    url = new URL(keyId)
  } catch {
    throw createHttpError(422, 'keyId is not a valid URI')
  }
  url.hash = ''
  return url.toString()
}

async function upsertRemoteActor(document: RemoteActorDocument): Promise<RemoteActorRow> {
  const hostnameId = await lookupHostnameId(document.actorUri)
  await using query = await beginTransaction()
  await query(sql`/* reserveRemoteActorIdentity */
    INSERT INTO remote_actor_identities (actor_uri) VALUES (${document.actorUri})
    ON CONFLICT (actor_uri) DO NOTHING
  `)
  const { rows: identities } = await query<{ id: string }>(sql`/* readRemoteActorIdentity */
    SELECT id FROM remote_actor_identities WHERE actor_uri = ${document.actorUri}
  `)
  const id = identities[0]!.id
  const { rows } = await query(sql`/* upsertRemoteActor */
    INSERT INTO remote_actors (id, key_id, public_key_pem, inbox_url, shared_inbox_url, fetched_at, hostname_id)
    VALUES (
      ${id}, ${document.keyId}, ${document.publicKeyPem},
      ${document.inboxUrl}, ${document.sharedInboxUrl}, CURRENT_TIMESTAMP, ${hostnameId}
    )
    ON CONFLICT (id) DO UPDATE
      SET key_id = EXCLUDED.key_id,
          public_key_pem = EXCLUDED.public_key_pem,
          inbox_url = EXCLUDED.inbox_url,
          shared_inbox_url = EXCLUDED.shared_inbox_url,
          fetched_at = CURRENT_TIMESTAMP,
          hostname_id = EXCLUDED.hostname_id
      WHERE remote_actors.deleted_at IS NULL
    RETURNING id, key_id, public_key_pem, inbox_url, shared_inbox_url,
              fetched_at, created_at, updated_at, hostname_id
  `)
  if (!rows[0]) throw createHttpError(403, 'Remote actor is no longer active')
  await query.commit()
  return { ...(rows[0] as Omit<RemoteActorRow, 'actor_uri'>), actor_uri: document.actorUri }
}
