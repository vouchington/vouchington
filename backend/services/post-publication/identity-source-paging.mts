import { listFeedRows } from './identity-feed-paging.mts'
import { publicationPageLimit } from './page-limit.mts'
import type { TransactionQuery } from '@data-stores/psql'
import type { PublicationSnapshotKey } from './identity-source.mts'
import { sourceBranchSql } from './identity-source-branch-sql.mts'
import type { SourceRow } from './identity-source-paging-types.mts'

const branches = [
  'review',
  'data',
  'relation',
  'alias_source',
  'alias_relation',
  'static',
  'slug',
  'feed',
] as const
export type PublicationIdentitySourcePage = {
  keys: PublicationSnapshotKey[]
  cursorKind: string | null
  cursorValue: string | null
  complete: boolean
}

/** Native source progress is independent of emitted identities, including duplicates and null mappings. */
export async function listPublicationIdentitySourcePage(
  query: TransactionQuery,
  postId: string,
  cursorKind: string | null,
  initialCursorValue: string | null,
  limit: number,
): Promise<PublicationIdentitySourcePage> {
  publicationPageLimit(limit)
  const keys: PublicationSnapshotKey[] = []
  let cursorValue = initialCursorValue
  let branchIndex =
    cursorKind === null ? 0 : branches.indexOf(cursorKind as (typeof branches)[number])
  if (branchIndex < 0) throw new TypeError('Invalid publication identity source branch')
  let remaining = limit
  while (branchIndex < branches.length && remaining > 0) {
    const branch = branches[branchIndex]!
    // oxlint-disable-next-line no-await-in-loop -- consume bounded native rows before progressing a source branch.
    const rows = await listSourceRows(query, branch, postId, cursorValue, remaining)
    for (const row of rows) {
      if (row.kind !== null)
        keys.push({
          kind: row.kind,
          uuidValue: row.uuidValue,
          textValue: row.textValue,
          postType: row.postType,
          day: row.day,
        })
    }
    const exhausted = rows.length < remaining
    remaining -= rows.length
    if (rows.length === 0 || (branch !== 'feed' && exhausted)) {
      branchIndex += 1
      cursorValue = null
    } else cursorValue = rows.at(-1)!.cursor
  }
  return {
    keys,
    cursorKind: branches[branchIndex] ?? null,
    cursorValue,
    complete: branchIndex === branches.length,
  }
}

async function listSourceRows(
  query: TransactionQuery,
  branch: (typeof branches)[number],
  postId: string,
  cursorValue: string | null,
  limit: number,
): Promise<SourceRow[]> {
  if (branch === 'feed') return listFeedRows(query, postId, cursorValue, limit)
  return (await query<SourceRow>(sourceBranchSql(branch, postId, cursorValue, limit))).rows
}
