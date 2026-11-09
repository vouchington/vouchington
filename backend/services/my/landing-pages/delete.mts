import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { promoteOldestRemainingLandingPage } from './shared.mts'
import { runLandingPageWriteTransaction } from './write-transaction.mts'
import { invalidate } from '@services/entity-cache/invalidate'

export async function deleteMyLandingPage(userId: string, pageId: string): Promise<void> {
  await runLandingPageWriteTransaction(query =>
    deleteLandingPageInTransaction(userId, pageId, query),
  )
  // Public landing-page GET responses are edge-cached and tagged user:<username> (see
  // ts-shared/cache/cache-tags.mts), so a deleted page must purge that tag.
  await invalidate.users(userId)
}

export async function deleteLandingPageInTransaction(
  userId: string,
  pageId: string,
  query: TransactionQuery,
): Promise<void> {
  const { rows } = await query<{ is_default: boolean }>(
    sql`/* deleteMyLandingPage */ DELETE FROM user_landing_pages WHERE id = ${pageId} AND user_id = ${userId} RETURNING is_default`,
  )
  const page = rows[0]
  assert(page, 404, 'Landing page not found')
  if (page.is_default) await promoteOldestRemainingLandingPage(userId, query)
}
