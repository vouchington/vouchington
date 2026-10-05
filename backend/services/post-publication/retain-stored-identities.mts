import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PublicationSnapshotKey } from './identity-source.mts'
import type { PublicationIdentitySourcePage } from './identity-source-paging.mts'
import { retainSnapshotPage } from './snapshot-key-writes.mts'
import { publicationSnapshotKeyPageSql } from './snapshot-key-pages.mts'
import { publicationPageLimit } from './page-limit.mts'

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
