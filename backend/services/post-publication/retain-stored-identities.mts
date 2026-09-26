import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PublicationSnapshotKey } from './identity-source.mts'
import type { PublicationIdentitySourcePage } from './identity-source-paging.mts'
import { POST_PUBLICATION_IDENTITY_SNAPSHOT_PAGE_SIZE } from './identity-snapshots.mts'
import { retainSnapshotPage } from './snapshot-key-writes.mts'
import { publicationSnapshotKeyPageSql } from './snapshot-key-pages.mts'
import { publicationPageLimit } from './page-limit.mts'

export async function retainStoredPublicationIdentities(
  query: TransactionQuery,
  dirtyWorkId: string,
  postId: string,
): Promise<void> {
  let kind: string | null = null
  let value: string | null = null
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- native receipt pages commit with disappearing sources.
    const page = await retainStoredPublicationIdentityPage(
      query,
      dirtyWorkId,
      postId,
      kind,
      value,
      POST_PUBLICATION_IDENTITY_SNAPSHOT_PAGE_SIZE,
    )
    if (page.complete) return
    kind = page.cursorKind
    value = page.cursorValue
  }
}

export async function retainStoredPublicationIdentityPage(
  query: TransactionQuery,
  dirtyWorkId: string,
  postId: string,
  kind: string | null,
  initialValue: string | null,
  limit: number,
): Promise<PublicationIdentitySourcePage> {
  publicationPageLimit(limit)
  let value = initialValue
  const { rows: receipts } = await query<{ snapshot: string | null }>(
    sql`/* getPublicationReceiptStorage */ SELECT applied_snapshot_id AS snapshot FROM post_publication_projection_receipts WHERE post_id = ${postId}`,
  )
  if (!receipts[0]) return { keys: [], cursorKind: null, cursorValue: null, complete: true }
  if (receipts[0].snapshot !== null) {
    const statement = sql`/* listStoredPublicationSnapshotNativePage */ `.append(
      publicationSnapshotKeyPageSql(receipts[0].snapshot, value, limit),
    )
    const { rows } = await query<PublicationSnapshotKey & { id: string }>(statement)
    await retainSnapshotPage(query, dirtyWorkId, rows)
    return {
      keys: rows,
      cursorKind: rows.length > 0 ? 'typed' : kind,
      cursorValue: rows.at(-1)?.id ?? value,
      complete: rows.length < limit,
    }
  }
  const branches = ['topicIds', 'identityKeys', 'sitemapTargets'] as const
  let index = kind === null ? 0 : branches.indexOf(kind as (typeof branches)[number])
  if (index < 0) throw new TypeError('Invalid publication receipt source branch')
  const keys: PublicationSnapshotKey[] = []
  let remaining = limit
  while (index < branches.length && remaining > 0) {
    const branch = branches[index]!
    const ordinal = value === null ? -1 : Number(value)
    const statement = sql`/* listLegacyPublicationReceiptOrdinalPage */ WITH receipt AS MATERIALIZED (SELECT COALESCE(applied_identity -> ${branch}, '[]'::jsonb) AS identities FROM post_publication_projection_receipts WHERE post_id = ${postId}), page AS MATERIALIZED (
      SELECT ordinal, identities -> ordinal AS value FROM receipt CROSS JOIN LATERAL generate_series(${ordinal + 1}, LEAST(jsonb_array_length(identities) - 1, ${ordinal + remaining})) AS ordinal)
      SELECT ordinal, `
    if (branch === 'topicIds')
      statement.append(
        sql`'topic'::text AS kind, (value #>> '{}')::uuid::text AS "uuidValue", NULL::text AS "textValue", NULL::text AS "postType", NULL::text AS day`,
      )
    else if (branch === 'sitemapTargets')
      statement.append(
        sql`'sitemap_target'::text AS kind, NULL::text AS "uuidValue", NULL::text AS "textValue", value ->> 'postType' AS "postType", value ->> 'day' AS day`,
      )
    else
      statement.append(sql`CASE WHEN value->>'kind' = 'author' AND NOT (value->>'value' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN 'author_username' ELSE value->>'kind' END AS kind,
      CASE WHEN value->>'kind' IN ('community','rss_feed') OR (value->>'kind' = 'author' AND value->>'value' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN value->>'value' END AS "uuidValue",
      CASE WHEN value->>'kind' IN ('community_slug','post_slug') OR (value->>'kind' = 'author' AND NOT (value->>'value' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')) THEN value->>'value' END AS "textValue", NULL::text AS "postType", NULL::text AS day`)
    statement.append(sql` FROM page ORDER BY ordinal`)
    // oxlint-disable-next-line no-await-in-loop -- count physical ordinals, including duplicates or null entries.
    const { rows } = await query<PublicationSnapshotKey & { ordinal: number }>(statement)
    keys.push(
      ...rows.filter(
        row =>
          row.uuidValue !== null ||
          row.textValue !== null ||
          (row.postType !== null && row.day !== null),
      ),
    )
    const exhausted = rows.length < remaining
    remaining -= rows.length
    if (exhausted) {
      index += 1
      value = null
    } else value = String(rows.at(-1)!.ordinal)
  }
  await retainSnapshotPage(query, dirtyWorkId, keys)
  return {
    keys,
    cursorKind: branches[index] ?? null,
    cursorValue: value,
    complete: index === branches.length,
  }
}
