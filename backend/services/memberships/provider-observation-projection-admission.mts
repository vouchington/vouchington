import type { QueryExecutor } from '@data-stores/psql'
import type { MembershipProviderSourceIdentity } from './create-types.mts'
import {
  assertDirectMembershipSourceAdmission,
  DirectMembershipSourceRejectedError,
} from './direct-source-authority.mts'

export async function retainRejectedDirectObservation(options: {
  userId: string
  plan: 'plus' | 'pro'
  sourceIdentity: MembershipProviderSourceIdentity
  enabled: boolean | undefined
  query: QueryExecutor
}): Promise<boolean> {
  try {
    await assertDirectMembershipSourceAdmission(
      options.userId,
      options.plan,
      options.sourceIdentity,
      options.query,
    )
    return false
  } catch (error) {
    if (options.enabled && error instanceof DirectMembershipSourceRejectedError) return true
    throw error
  }
}
