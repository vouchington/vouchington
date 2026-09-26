import type { TransactionQuery } from '@data-stores/psql/types'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import {
  identityCursorValue,
  listPublicationIdentitySourcePage,
  POST_PUBLICATION_IDENTITY_SNAPSHOT_PAGE_SIZE,
} from './identity-snapshots.mts'
import { retainSnapshotPage } from './snapshot-key-writes.mts'
import { retainPostPublicationKeys } from './retained-key-writes.mts'

export type PostPublicationPostScopeContext = { dirtyWorkId: string; postId: string }

/** Pages disappearing sources in the mutation's transaction, including descendants' sitemap days. */
export async function retainPostPublicationPostScopeContext(
  query: TransactionQuery,
  scopes: readonly PostPublicationPostScopeContext[],
): Promise<void> {
  for (const scope of scopes) {
    // oxlint-disable-next-line no-await-in-loop -- capture must precede the caller's mutation.
    await retainPostScope(query, scope)
  }
}

async function retainPostScope(
  query: TransactionQuery,
  scope: PostPublicationPostScopeContext,
): Promise<void> {
  let cursorKind: string | null = null
  let cursorValue: string | null = null
  const limit = POST_PUBLICATION_IDENTITY_SNAPSHOT_PAGE_SIZE
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- exact source keyset pages share the caller transaction.
    const page = await listPublicationIdentitySourcePage(
      query,
      scope.postId,
      cursorKind,
      cursorValue,
      limit,
    )
    // oxlint-disable-next-line no-await-in-loop -- retain every page before advancing its cursor.
    await retainSnapshotPage(query, scope.dirtyWorkId, page)
    if (page.length < limit) break
    cursorKind = page.at(-1)!.kind
    cursorValue = identityCursorValue(page.at(-1)!)
  }
  let descendantCursor: string | null = null
  while (true) {
    const { rows }: { rows: Array<{ value: string; post_type: string; day: string }> } =
      // oxlint-disable-next-line no-await-in-loop -- root deletion must capture every distinct descendant shard.
      await query<{ value: string; post_type: string; day: string }>(
        `/* listDescendantPostPublicationSitemapPage */
      WITH targets AS (SELECT DISTINCT post_type, (created_at AT TIME ZONE 'UTC')::date AS day
        FROM posts WHERE root_id = $1 AND post_type = ANY($2::post_types[])), ordered AS (
        SELECT post_type::text, day::text, post_type::text || ':' || day::text AS value FROM targets)
      SELECT * FROM ordered WHERE ($3::text IS NULL OR value COLLATE "C" > $3 COLLATE "C")
      ORDER BY value COLLATE "C" LIMIT $4`,
        [scope.postId, SITEMAP_CONFIG.POST_TYPES, descendantCursor, limit],
      )
    // oxlint-disable-next-line no-await-in-loop -- retention is atomic with the disappearing source.
    await retainPostPublicationKeys(
      query,
      scope.dirtyWorkId,
      rows.map(row => ({ kind: 'sitemap_target', postType: row.post_type, day: row.day })),
    )
    if (rows.length < limit) break
    descendantCursor = rows.at(-1)!.value
  }
}
