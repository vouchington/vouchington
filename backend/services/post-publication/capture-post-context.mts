import { publicationPageLimit } from './page-limit.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import { POST_PUBLICATION_IDENTITY_SNAPSHOT_PAGE_SIZE } from './identity-snapshots.mts'
import { listPublicationIdentitySourcePage } from './identity-source-paging.mts'
import { retainSnapshotPage } from './snapshot-key-writes.mts'
import { retainPostPublicationKeys } from './retained-key-writes.mts'
import { nativeSourceBounds, nativeSourceRange } from './native-source-range.mts'

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
  const { rows: owners } = await query<{ post_id: string | null }>(
    `/* resolvePublicationPostScopeLiveOwner */ SELECT post_id FROM post_publication_post_identities WHERE id = $1`,
    [scope.postId],
  )
  const livePostId = owners[0]?.post_id
  if (!livePostId) return
  let cursorKind: string | null = null
  let cursorValue: string | null = null
  const limit = POST_PUBLICATION_IDENTITY_SNAPSHOT_PAGE_SIZE
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- exact source keyset pages share the caller transaction.
    const page = await listPublicationIdentitySourcePage(
      query,
      livePostId,
      cursorKind,
      cursorValue,
      limit,
    )
    // oxlint-disable-next-line no-await-in-loop -- retain every page before advancing its cursor.
    await retainSnapshotPage(query, scope.dirtyWorkId, page.keys)
    if (page.complete) break
    cursorKind = page.cursorKind
    cursorValue = page.cursorValue
  }
  let descendantCursor: string | null = null
  while (true) {
    const statement = sql`/* listDescendantPostPublicationSitemapPage */
      WITH `
      .append(nativeSourceBounds(livePostId))
      .append(
        sql`, page AS MATERIALIZED (SELECT id, post_type, created_at FROM posts CROSS JOIN native_bounds WHERE `,
      )
    statement.append(
      nativeSourceRange('root_id', ['id'], descendantCursor === null ? null : [descendantCursor]),
    )
    statement.append(sql` ORDER BY root_id, id LIMIT `).append(publicationPageLimit(limit))
      .append(sql`)
      SELECT id, CASE WHEN post_type = ANY(${SITEMAP_CONFIG.POST_TYPES}::post_types[]) THEN post_type::text END AS post_type,
        (created_at AT TIME ZONE 'UTC')::date::text AS day FROM page ORDER BY id`)
    const { rows }: { rows: Array<{ id: string; post_type: string | null; day: string }> } =
      // oxlint-disable-next-line no-await-in-loop -- root deletion must capture every distinct descendant shard.
      await query<{ id: string; post_type: string | null; day: string }>(statement)
    // oxlint-disable-next-line no-await-in-loop -- retention is atomic with the disappearing source.
    await retainPostPublicationKeys(
      query,
      scope.dirtyWorkId,
      rows.flatMap(row =>
        row.post_type === null
          ? []
          : [{ kind: 'sitemap_target' as const, postType: row.post_type, day: row.day }],
      ),
    )
    if (rows.length < limit) break
    descendantCursor = rows.at(-1)!.id
  }
}
