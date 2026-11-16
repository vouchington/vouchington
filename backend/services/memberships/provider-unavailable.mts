import { beginTransaction } from '@data-stores/psql'
import { finalizePendingMembershipVerification } from './verification-work.mts'

export class MembershipProviderUnavailableError extends Error {
  override readonly name: string = 'MembershipProviderUnavailableError'
}

export async function rejectUnavailableMembershipProvider(verificationId: string): Promise<void> {
  await using query = await beginTransaction()
  if (
    !(await finalizePendingMembershipVerification(
      query,
      verificationId,
      'rejected',
      'provider_unavailable',
    ))
  )
    return
  await query.commit()
}
