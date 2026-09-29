import { searchAdminUsers, searchUsers } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { ADMIN_EMAIL_PROBE, ADMIN_EMAIL_PROBE_INDEX } from '../seed-data/admin-emails.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runAdminUserSearchScenarios(): Promise<void> {
  await runAndCapture('search-users', () => searchUsers('seeduser', { limit: 25 }))
  await runAndCapture(
    'search-admin-users',
    () => searchAdminUsers('seeduser', { limit: 25 }),
    'prefix',
  )
  await runAndCapture(
    'search-admin-users-uuid',
    () => searchAdminUsers(seedUser.id, { limit: 25 }),
    'uuid',
  )
  await runAndCapture(
    'search-admin-users-email',
    async () => {
      const { results } = await searchAdminUsers(ADMIN_EMAIL_PROBE, { limit: 25 })
      if (results.length !== 1 || results[0]?.id !== seedUuid(ADMIN_EMAIL_PROBE_INDEX, '01'))
        throw new Error('Admin email EXPLAIN probe must return its seeded user')
    },
    'email',
    'searchAdminUsers',
  )
}
