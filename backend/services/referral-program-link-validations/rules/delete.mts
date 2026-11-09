import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import { validateUUID } from '@modules/utils'
import { withTransactionOptions } from '@data-stores/psql'
import { getReferralLinkValidationRule } from './get.mts'

export async function deleteReferralLinkValidationRule(
  currentUser: PrivateUser | null,
  validationId: string,
  ruleId: string,
): Promise<void> {
  assert(currentUser, 401, 'User not logged in')
  assert(currentUserCanUpdateTopic(currentUser), 403, 'Forbidden')
  validateUUID(validationId)
  validateUUID(ruleId)

  const existing = await getReferralLinkValidationRule(ruleId)
  assert(existing, 404, 'Rule not found')
  assert(existing.referral_program_link_validation_id === validationId, 404, 'Rule not found')

  await withTransactionOptions({}, query =>
    query(sql`/* deleteReferralLinkValidationRule */
        DELETE FROM referral_program_link_validation_rules
        WHERE id = ${ruleId}
      `),
  )
}
