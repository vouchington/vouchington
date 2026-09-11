import assert from 'http-assert'
import {
  beginTransaction,
  withTransactionOptions,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import { createReferralLinkValidation, type ReferralLinkValidation } from './validations.mts'
import { linkValidationToReferralProgram } from '@services/topics/referral-programs'
import { assertReferralProgramExists } from '@services/topics/validation'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import type { PrivateUser } from '@services/users/types'

export function createAndLinkValidationToReferralProgram(
  currentUser: PrivateUser | null | undefined,
  referralProgramId: string,
  data: { slug: string; user_help_text?: string },
  options: QueryOptions = {},
): Promise<ReferralLinkValidation> {
  assert(currentUser, 401, 'Unauthorized')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  if (options.query || options.client) {
    return withTransactionOptions(options, query =>
      createAndLinkValidationInTransaction(currentUser, referralProgramId, data, options, query),
    )
  }
  return createAndLinkValidationInOwnedTransaction(currentUser, referralProgramId, data, options)
}

async function createAndLinkValidationInOwnedTransaction(
  currentUser: PrivateUser,
  referralProgramId: string,
  data: { slug: string; user_help_text?: string },
  options: QueryOptions,
): Promise<ReferralLinkValidation> {
  await using transaction = await beginTransaction()
  const result = await createAndLinkValidationInTransaction(
    currentUser,
    referralProgramId,
    data,
    options,
    transaction,
  )
  await transaction.commit()
  return result
}

async function createAndLinkValidationInTransaction(
  currentUser: PrivateUser,
  referralProgramId: string,
  data: { slug: string; user_help_text?: string },
  options: QueryOptions,
  query: TransactionQuery,
): Promise<ReferralLinkValidation> {
  const validation = await createReferralLinkValidationForProgram(
    currentUser,
    referralProgramId,
    data,
    options,
    query,
  )
  await linkValidationToReferralProgram(currentUser, referralProgramId, validation.id, {
    ...options,
    query,
  })
  return validation
}

async function createReferralLinkValidationForProgram(
  currentUser: PrivateUser,
  referralProgramId: string,
  data: { slug: string; user_help_text?: string },
  options: QueryOptions,
  query: TransactionQuery,
): Promise<ReferralLinkValidation> {
  await assertReferralProgramExists(referralProgramId, 'referralProgramId', { ...options, query })
  return createReferralLinkValidation(currentUser, data, { ...options, query })
}
