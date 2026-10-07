import {
  beginTransaction,
  withTransactionOptions,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { ModerationAppealResponse } from './types.mts'
import type { CreateModerationAppealInput } from './parse.mts'
import { resolveAppealTarget } from './create-target.mts'
import { insertModerationAppeal } from './create-insert.mts'
import { getModerationAppealAfterMutation } from './get.mts'

/**
 * Files an appeal. With `queryOptions.query` the insert joins the caller's transaction, which then
 * owns the commit and the resolution enqueue after it; otherwise it runs and commits its own.
 */
export async function createModerationAppeal(
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  input: CreateModerationAppealInput,
  queryOptions?: QueryOptions,
): Promise<{ appeal: ModerationAppealResponse; isDuplicate: boolean }> {
  const run = async (query: TransactionQuery) => {
    const options = { query }
    const target = await resolveAppealTarget(currentUser, input, options)
    if (target.duplicate) {
      return {
        appeal: await getModerationAppealAfterMutation(target.duplicate.id, options),
        isDuplicate: true,
      }
    }
    return insertModerationAppeal(query, currentUser, provenance, input.appealReason, target)
  }
  if (queryOptions?.query) return withTransactionOptions(queryOptions, run)
  await using query = await beginTransaction()
  const result = await run(query)
  await query.commit()
  return result
}
