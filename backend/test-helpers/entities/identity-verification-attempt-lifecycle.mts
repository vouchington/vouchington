import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type IdentityVerificationAttemptLifecycle = {
  consumed_at: Date | null
  id: string
  provider_creation_started_at: Date | null
  provider_session_id: string | null
  released_at: Date | null
}

/** Read the provider-session lifecycle columns of the attempt attached to one Checkout session. */
export async function getIdentityVerificationAttemptLifecycleByCheckout(
  checkoutSessionId: string,
): Promise<IdentityVerificationAttemptLifecycle | null> {
  const { rows } = await read<IdentityVerificationAttemptLifecycle>(
    sql`/* getIdentityVerificationAttemptLifecycleByCheckout */
    SELECT id, provider_creation_started_at, provider_session_id, released_at, consumed_at
    FROM identity_verification_attempts
    WHERE checkout_session_id = ${checkoutSessionId}
  `,
  )
  return rows[0] ?? null
}
