import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export async function seedMembershipChange(): Promise<void> {
  await write(
    `/* seedExplainData */ INSERT INTO membership_changes
       (membership_id, user_id, change_type)
     VALUES ($1::uuid, $2::uuid, 'upgrade')`,
    [seedUuid(0, '31'), seedUuid(0, '01')],
  )
}
