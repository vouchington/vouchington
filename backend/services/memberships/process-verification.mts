import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { processAppleMembershipVerification } from './apple/process-verification.mts'
import { createConfiguredGooglePlaySubscriptionsV2Client } from './google/configured-client.mts'
import { processGooglePlayMembershipVerification } from './google/process-verification.mts'
import { processMicrosoftStoreMembershipVerification } from './microsoft/process-verification.mts'
import { deferMembershipVerificationUntilAdapterAvailable } from './verification-recovery.mts'

export async function processMembershipVerification(verificationId: string): Promise<void> {
  const { rows } = await read<{ provider: string }>(sql`/* processMembershipVerification.provider */
    SELECT provider FROM membership_verifications WHERE id = ${verificationId} LIMIT 1`)
  switch (rows[0]?.provider) {
    case 'apple_app_store':
      await processAppleMembershipVerification(verificationId)
      return
    case 'google_play':
      await processGooglePlayMembershipVerification(verificationId, {
        client: createConfiguredGooglePlaySubscriptionsV2Client(),
      })
      return
    case 'microsoft_store':
      await processMicrosoftStoreMembershipVerification(verificationId)
      return
    default:
      await deferMembershipVerificationUntilAdapterAvailable(verificationId)
  }
}
