import { getUrlIdentity } from '@modules/utils/urls'
import { read, write } from '@data-stores/psql'
import type { QueryOptions, TransactionQuery } from '@data-stores/psql/types'
import { lockCanonicalUrlRewrites } from './canonical-lock.mts'
import { setCanonicalUrls } from './set-canonical-batch.mts'
import { attachDistinctCanonicalHostnames, type UpsertedUrlRow } from './upsert-write.mts'

/**
 * Takes the canonical rewrite fence before hostname and URL row locks when this batch will insert
 * a variant of an existing page, so the later canonical write cannot deadlock against rewrites.
 * Batches without a new variant take `otherwise` (a caller that already holds the shared fence
 * keeps it) or no lock at all.
 */
export async function lockCanonicalRewritesForNewVariants(
  query: TransactionQuery,
  urls: readonly URL[],
  otherwise?: 'shared',
): Promise<void> {
  const hrefs = urls.map(url => url.toString())
  const { rows } = await query(
    `/* findNewUrlVariants */
    SELECT 1
    FROM unnest($1::text[], $2::text[]) AS input(url, identity)
    JOIN url_identities ON url_identities.identity = input.identity
    WHERE NOT EXISTS (SELECT 1 FROM urls WHERE urls.url = input.url)
    LIMIT 1`,
    [hrefs, hrefs.map(href => getUrlIdentity(href))],
  )
  if (rows.length > 0) await lockCanonicalUrlRewrites(query)
  else if (otherwise) await lockCanonicalUrlRewrites(query, otherwise)
}

/**
 * Registers each inserted URL's page identity. The oldest row (lowest UUIDv7 within a batch, first
 * committed across batches) owns an identity; every later row for it is a variant and is pointed at
 * the owner's canonical target through the shared canonical writer, in the inserting transaction.
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

  const variants = urlIds.flatMap((id, index) =>
    ownedIds.has(id) ? [] : [{ id, identity: identities[index]! }],
  )
  const owners = await query<{ url_id: string; owner_id: string }>(
    `/* findUrlIdentityOwners */
    SELECT input.url_id, url_identities.url_id AS owner_id
    FROM unnest($1::uuid[], $2::text[]) AS input(url_id, identity)
    JOIN url_identities ON url_identities.identity = input.identity
    WHERE url_identities.url_id <> input.url_id`,
    [variants.map(variant => variant.id), variants.map(variant => variant.identity)],
  )
  const resolved = await setCanonicalUrls(
    owners.rows.map(row => ({ urlId: row.url_id, canonicalUrlId: row.owner_id })),
    query,
  )
  const canonicalById = new Map(resolved.map(result => [result.urlId, result.finalCanonicalId]))
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
