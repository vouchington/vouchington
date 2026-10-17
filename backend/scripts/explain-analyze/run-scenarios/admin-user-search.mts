import { searchAdminUsers, searchUsers } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { ADMIN_EMAIL_PROBE, ADMIN_EMAIL_PROBE_INDEX } from '../seed-data/admin-emails.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

export async function runAdminUserSearchScenarios(): Promise<void> {
  registerScenarioContract('search-users', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_users__username'] },
      { kind: 'maxProcessedRows', relation: 'users', max: 95 },
    ],
  })
  await runAndCapture('search-users', async () => {
    const page = await searchUsers('seeduser', { limit: 25 })
    if (page.results.some(user => user.id === seedUuid(20_000, '01')))
      throw new Error('Public user search returned the deleted seed user')
  })
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
  registerScenarioContract('search-admin-users-email', {
    expectations: [{ kind: 'custom', name: 'adminEmail' }],
  })
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
