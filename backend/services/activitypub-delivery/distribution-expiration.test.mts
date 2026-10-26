import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { createTestUserDirect } from '@voucha/test-helpers'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import {
  insertUnfinishedDistributionForTest,
  readDistributionExpirationStateForTest,
} from '@voucha/test-helpers/activitypub-distribution-expiration'
import { advanceFederationReplayFloorForTest } from '@voucha/test-helpers/federation-retention-replay'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import {
  withCapturedTestQueries,
  countCapturedQueriesByAnnotation,
} from '@voucha/test-helpers/query-capture'
import { prepareActivityDistributionPage } from './distribution-progress.mts'

describe('permanent-floor checkpoint expiration', () => {
  it('terminalizes only matching extant work under the existing floor lock without resetting its cursor', async () => {
    const source = await createTestUserDirect()
    const other = await createTestUserDirect()
    onTestFinished(() => deleteTestUser(source.id))
    onTestFinished(() => deleteTestUser(other.id))
    const id = v7()
    const wrongOwnerId = v7()
    const absentId = v7()
    const fixture = await insertUnfinishedDistributionForTest(id, source.id)
    await insertUnfinishedDistributionForTest(wrongOwnerId, other.id)
    await withPostgresTransactionForTest(async query => {
      await advanceFederationReplayFloorForTest(query, 'outbound', new Date(Date.now() + 3_600_000))
      const captured = await withCapturedTestQueries(() =>
        prepareActivityDistributionPage(id, source.id, { query }),
      )
      expect(captured.result).toEqual({ status: 'expired' })
      expect(countCapturedQueriesByAnnotation(captured.queries, 'lockActivityPubReplayFloor')).toBe(
        1,
      )
      expect(
        countCapturedQueriesByAnnotation(
          captured.queries,
          'prepareActivityDistributionPage:insert',
        ),
      ).toBe(0)
      const terminal = await readDistributionExpirationStateForTest(id, query)
      expect(terminal).toMatchObject({
        completed_at: expect.any(Date),
        cursor_remote_actor_id: fixture.cursor,
        attempt_count: 3,
        lease_token: null,
        leased_at: null,
        lease_expires_at: null,
      })
      await prepareActivityDistributionPage(id, source.id, { query })
      expect(await readDistributionExpirationStateForTest(id, query)).toEqual(terminal)
      const wrongOwner = await readDistributionExpirationStateForTest(wrongOwnerId, query)
      await prepareActivityDistributionPage(wrongOwnerId, source.id, { query })
      expect(await readDistributionExpirationStateForTest(wrongOwnerId, query)).toEqual(wrongOwner)
      await prepareActivityDistributionPage(absentId, source.id, { query })
      expect(await readDistributionExpirationStateForTest(absentId, query)).toBeNull()
    })
  })
})
