import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

// A consumed self-paid attempt reaches the membership entitlement gate. User 0
// has a live paid membership, while the surrounding user seed includes free users.
export async function seedViewDrivenIdentity(): Promise<void> {
  await write(
    `/* seedViewDrivenIdentity */ INSERT INTO identity_verification_attempts
       (id, user_id, source, provider_creation_started_at, consumed_at)
     VALUES ($1::uuid, $2::uuid, 'self_paid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO NOTHING`,
    [seedUuid(0, '4a'), seedUuid(0, '01')],
  )
}
