import { describe, expect, it, onTestFinished } from 'vitest'
import { withTestOwnedAdvisoryWait } from '@voucha/test-helpers/advisory-client-lock-observer'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  getTestPostgresAdvisoryLockHolderProcessId,
  insertTestUrlHostname,
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
    void holder.catch(entered.reject)
    let managed = false
    let holderRelease: Promise<void> | undefined
    const releaseHolder = () => {
      release.resolve()
      return (holderRelease ??= holder)
    }
    onTestFinished(async () => {
      if (managed) await Promise.allSettled([releaseHolder()])
      else await releaseHolder()
    })
    await entered.promise
    const key = `vote-request:hostname:${user.id.toLowerCase()}:${hostnameId.toLowerCase()}`
    const holderPid = await getTestPostgresAdvisoryLockHolderProcessId({ key })
    const request = createRequest()
    await request.authenticateAs(user)
    const requestId = crypto.randomUUID()
    managed = true
    await withTestOwnedAdvisoryWait(
      {
        holderProcessId: holderPid,
        pool: 'advisory',
        key,
        queryMarker: 'lockElectionVoteRequest',
        requestId,
        releaseHolder,
      },
      async waitForLock => {
        const deletion = request
          .delete(`/api/v1/hostnames/${hostnameId}/vote`)
          .set('x-request-id', requestId)
          .expect(204)
          .then(() => undefined)
        await waitForLock(deletion)
        await upsertHostnameElectionVotes(user.id, [{ entityId: hostnameId, score: 1 }])
        await releaseHolder()
        await deletion
      },
    )
    await expect(getHostnameElectionVote(user.id, hostnameId)).resolves.toBeNull()
  })
})
