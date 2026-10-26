import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { processAppleMembershipVerification } from './apple/process-verification.mts'
import { createConfiguredGooglePlaySubscriptionsV2Client } from './google/configured-client.mts'
import { processGooglePlayMembershipVerification } from './google/process-verification.mts'
import { processMicrosoftStoreMembershipVerification } from './microsoft/process-verification.mts'
import {
  MembershipProviderUnavailableError,
  rejectUnavailableMembershipProvider,
} from './provider-unavailable.mts'

export async function processMembershipVerification(verificationId: string): Promise<void> {
  const { rows } = await read<{ provider: string }>(sql`/* processMembershipVerification.provider */
    SELECT context.provider
    FROM membership_verifications verification
    JOIN membership_provider_contexts context ON context.id = verification.membership_provider_context_id
    WHERE verification.id = ${verificationId}
      AND verification.verified_at IS NULL AND verification.conflicted_at IS NULL
      AND verification.rejected_at IS NULL LIMIT 1`)
  try {
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
        if (rows.length) await rejectUnavailableMembershipProvider(verificationId)
    }
  } catch (err) {
    if (!(err instanceof MembershipProviderUnavailableError)) throw err
    await rejectUnavailableMembershipProvider(verificationId)
  }
}
