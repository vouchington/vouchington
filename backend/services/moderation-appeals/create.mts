import { beginTransaction, withTransactionOptions, type TransactionQuery } from '@data-stores/psql'
import type { PrivateUser } from '@voucha/types/entities/user'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { ModerationAppealResponse } from './types.mts'
import type { CreateModerationAppealInput } from './parse.mts'
import { resolveAppealTarget } from './create-target.mts'
import { insertModerationAppeal } from './create-insert.mts'
import { getModerationAppealAfterMutation } from './get.mts'

/**
 * Files an appeal. With `options.query` the insert joins the caller's transaction, which then
 * owns the commit and the resolution enqueue after it; otherwise it runs and commits its own.
 * Only the caller's transaction query crosses this service boundary; unsupported option keys fail.
 */
export async function createModerationAppeal(
  currentUser: PrivateUser,
  provenance: ContentProvenance,
  input: CreateModerationAppealInput,
  options?: { query: TransactionQuery },
): Promise<{ appeal: ModerationAppealResponse; isDuplicate: boolean }> {
  if (options && Reflect.ownKeys(options).some(key => key !== 'query'))
    throw new TypeError('Only query is supported for moderation appeal creation')
  const run = async (query: TransactionQuery) => {
    const queryOptions = { query }
    const target = await resolveAppealTarget(currentUser, input, queryOptions)
    if (target.duplicate) {
      return {
        appeal: await getModerationAppealAfterMutation(target.duplicate.id, queryOptions),
        isDuplicate: true,
      }
    }
    return insertModerationAppeal(query, currentUser, provenance, input.appealReason, target)
  }
  if (options?.query) return withTransactionOptions({ query: options.query }, run)
  await using query = await beginTransaction()
  const result = await run(query)
  await query.commit()
  return result
}
