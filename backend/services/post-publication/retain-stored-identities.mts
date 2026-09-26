import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { publicationReceiptIdentityRowsSql } from './receipt-identity-source.mts'
import { publicationIdentityValueSql, type PublicationSnapshotKey } from './identity-source.mts'
import {
  identityCursorValue,
  POST_PUBLICATION_IDENTITY_SNAPSHOT_PAGE_SIZE,
} from './identity-snapshots.mts'
import { retainSnapshotPage } from './snapshot-key-writes.mts'

export async function retainStoredPublicationIdentities(
  query: TransactionQuery,
  dirtyWorkId: string,
  postId: string,
): Promise<void> {
  let kind: string | null = null
  let value: string | null = null
  const limit = POST_PUBLICATION_IDENTITY_SNAPSHOT_PAGE_SIZE
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- exact SQL-side receipt pages are retained in the caller transaction.
    const rows = await retainStoredPublicationIdentityPage(
      query,
      dirtyWorkId,
      postId,
      kind,
      value,
      limit,
    )
    if (rows.length < limit) return
    kind = rows.at(-1)!.kind
    value = identityCursorValue(rows.at(-1)!)
  }
}

export async function retainStoredPublicationIdentityPage(
  query: TransactionQuery,
  dirtyWorkId: string,
  postId: string,
  kind: string | null,
  value: string | null,
  limit: number,
): Promise<PublicationSnapshotKey[]> {
  const statement = sql`/* retainStoredPublicationIdentityPage */ WITH source AS (`
  statement
    .append(publicationReceiptIdentityRowsSql(sql`${postId}::uuid`))
    .append(sql`), ordered AS (SELECT *, `)
    .append(publicationIdentityValueSql()).append(sql` AS value FROM source)
    SELECT kind, uuid_value::text AS "uuidValue", text_value AS "textValue", post_type::text AS "postType", day::text AS day
    FROM ordered WHERE (${kind}::text IS NULL OR (kind COLLATE "C", value) > (${kind}::text COLLATE "C", ${value}::text COLLATE "C"))
    ORDER BY kind COLLATE "C", value LIMIT ${limit}`)
  const { rows } = await query<PublicationSnapshotKey>(statement)
  await retainSnapshotPage(query, dirtyWorkId, rows)
  return rows
}
