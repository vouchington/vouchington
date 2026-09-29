import { beginTransaction } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export const ADMIN_EMAIL_SEED_COUNT = 20_000
export const ADMIN_EMAIL_PROBE_INDEX = 1234
export const ADMIN_EMAIL_PROBE = `seeduser${ADMIN_EMAIL_PROBE_INDEX}@example.com`

export async function seedAdminEmails(): Promise<void> {
  console.log(
    `Seeding ${ADMIN_EMAIL_SEED_COUNT} primary addresses and one non-primary address per user...`,
  )
  await using transaction = await beginTransaction()
  for (let offset = 0; offset < ADMIN_EMAIL_SEED_COUNT; offset += 500) {
    const values: unknown[] = []
    const rows: string[] = []
    for (let index = offset; index < offset + 500; index += 1) {
      values.push(
        seedUuid(index, '01'),
        `seeduser${index}@example.com`,
        `seeduser${index}.other@example.com`,
      )
      const userParam = values.length - 2
      rows.push(
        `($${userParam}, $${userParam + 1}, TRUE)`,
        `($${userParam}, $${userParam + 2}, FALSE)`,
      )
    }
    await transaction(
      `/* seedExplainData */ INSERT INTO user_email_addresses (user_id, email_address, is_primary)
       VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    )
  }
  await transaction.commit()
}
