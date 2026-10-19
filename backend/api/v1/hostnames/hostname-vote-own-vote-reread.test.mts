import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getTestPostgresAdvisoryLockHolderProcessId,
  insertTestUrlHostname,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import {
  getHostnameElectionVote,
  upsertHostnameElectionVotes,
} from '@services/elections-votes/hostname'
import { withElectionVoteRequestLock } from '@services/elections-votes/shared/request-lock'

describe('hostname vote request lock', () => {
  it('clears a vote committed while this request waited for its own lock', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const hostnameId = await insertTestUrlHostname({
      hostname: `own-vote-${crypto.randomUUID().slice(0, 8)}.example.com`,
    })
    const release = Promise.withResolvers<void>()
    const entered = Promise.withResolvers<void>()
    const holder = withElectionVoteRequestLock('hostname', user.id, hostnameId, async () => {
      entered.resolve()
      await release.promise
    })
    await entered.promise
    const holderPid = await getTestPostgresAdvisoryLockHolderProcessId({
      key: `vote-request:hostname:${user.id.toLowerCase()}:${hostnameId.toLowerCase()}`,
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const deletion = request
      .delete(`/api/v1/hostnames/${hostnameId}/vote`)
      .expect(204)
      .then(
        () => undefined,
        (err: unknown) => err,
      )

    await waitForTestPostgresLockWaiter(holderPid, 'lockElectionVoteRequest')
    await upsertHostnameElectionVotes(user.id, [{ entityId: hostnameId, score: 1 }])
    release.resolve()
    await expect(deletion).resolves.toBeUndefined()
    await holder

    await expect(getHostnameElectionVote(user.id, hostnameId)).resolves.toBeNull()
  })
})
