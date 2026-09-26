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
  const value = initialValue
  const { rows: receipts } = await query<{ snapshot: string }>(
    sql`/* getPublicationReceiptStorage */ SELECT applied_snapshot_id AS snapshot FROM post_publication_projection_receipts WHERE post_identity_id = ${postId}`,
  )
  if (!receipts[0]) return { keys: [], cursorKind: null, cursorValue: null, complete: true }
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
