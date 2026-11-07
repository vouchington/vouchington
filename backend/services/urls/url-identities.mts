import { getUrlIdentity } from '@modules/utils/urls'
import { read, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import createError from 'http-errors'
import {
  getHostnamePolicyGroups,
  getLocalHostnamePolicies,
} from '@services/urls-hostnames/policies'
import { attachDistinctCanonicalHostnames, type UpsertedUrlRow } from './upsert-write.mts'

/**
 * Registers each inserted URL's page identity. The oldest row (lowest UUIDv7 within a batch, first
 * committed across batches) owns an identity; every later row for it is a variant and is pointed at
 * the owner's canonical target in the inserting transaction, under the caller's shared fence.
 */
export async function linkNewUrlVariants(
  rows: UpsertedUrlRow[],
  query: TransactionQuery,
): Promise<UpsertedUrlRow[]> {
  const inserted = rows.filter(row => row.inserted)
  if (inserted.length === 0) return rows
  const urlIds = inserted.map(row => row.id)
  const identities = inserted.map(row => getUrlIdentity(row.url))

  const registered = await query<{ url_id: string }>(
    `/* registerUrlIdentities */
    INSERT INTO url_identities (identity, url_id)
    SELECT input.identity, input.url_id
    FROM unnest($1::text[], $2::uuid[]) AS input(identity, url_id)
    ORDER BY input.identity, input.url_id
    ON CONFLICT (identity) DO NOTHING
    RETURNING url_id`,
    [identities, urlIds],
  )
  const ownedIds = new Set(registered.rows.map(row => row.url_id))
  if (ownedIds.size === urlIds.length) return rows

  // A brand-new row is invisible to others, so nothing points at it: no cycle, back-reference or
  // Hacker News reference can exist. The caller holds the shared canonical fence, so the owner's
  // flat chain cannot move; the owner's final target is its canonical, or the owner itself.
  const variantIds = urlIds.filter(id => !ownedIds.has(id))
  const variantIdentities = variantIds.map(id => identities[urlIds.indexOf(id)]!)
  const linked = await query<{ id: string; canonical_url_id: string }>(
    `/* linkNewUrlVariants */
    UPDATE urls SET canonical_url_id = COALESCE(owner.canonical_url_id, owner.id)
    FROM unnest($1::uuid[], $2::text[]) AS input(url_id, identity)
    JOIN url_identities ON url_identities.identity = input.identity
    JOIN urls AS owner ON owner.id = url_identities.url_id
    WHERE urls.id = input.url_id AND owner.id <> input.url_id
    RETURNING urls.id, urls.canonical_url_id`,
    [variantIds, variantIdentities],
  )
  const canonicalById = new Map(linked.rows.map(row => [row.id, row.canonical_url_id]))
  return attachDistinctCanonicalHostnames(
    rows.map(row => {
      const canonicalUrlId = canonicalById.get(row.id)
      return canonicalUrlId ? { ...row, canonical_url_id: canonicalUrlId } : row
    }),
    { query },
  )
}

/** Finds the row that owns the page identity of a urls table URL, or null for a new page. */
export async function findUrlIdByIdentity(
  href: string,
  options: QueryOptions = {},
): Promise<string | null> {
  const query = options.readOnly === false ? write : read
  const { rows } = await query<{ url_id: string }>(
    `/* findUrlIdByIdentity */
    SELECT url_id FROM url_identities WHERE identity = $1`,
    [getUrlIdentity(href)],
    options,
  )
  return rows[0]?.url_id ?? null
}

/**
 * A row adopts its page's canonical destination when published, so a blocked destination hostname
 * blocks the submission just as a blocked submitted hostname does.
 */
export async function assertCanonicalHostnamesNotBlocked(
  rows: UpsertedUrlRow[],
  query: TransactionQuery,
): Promise<void> {
  const hostnameIds = [
    ...new Set(
      rows.flatMap(row =>
        row.canonical_hostname_id && row.canonical_hostname_id !== row.hostname_id
          ? [row.canonical_hostname_id]
          : [],
      ),
    ),
  ]
  if (hostnameIds.length === 0) return
  const { rows: hostnames } = await query<{ hostname: string }>(
    `/* canonicalDestinationHostnames */
    SELECT hostname FROM url_hostnames WHERE id = ANY($1::uuid[])`,
    [hostnameIds],
  )
  const policies = await getLocalHostnamePolicies(
    getHostnamePolicyGroups(hostnames.map(row => row.hostname)),
    { query },
  )
  for (const [hostname, policy] of policies)
    if (policy.is_blocked) throw createError(422, `Hostname ${hostname} is blocked`)
}
