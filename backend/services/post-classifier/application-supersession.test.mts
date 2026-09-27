import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createPostClassifierExecutionFixture,
  initializePostClassifierExecutionTests,
} from '@voucha/test-helpers/data-stores/psql/post-classifier/execution'
import { getPostClassifierApplicationFacts } from '@voucha/test-helpers/data-stores/psql/post-classifier/application-service'
import { setPostClassifierToggleForTest } from '@voucha/test-helpers/entities/post-classifier-toggles'
import {
  startPostClassifierProviderAttempt,
  failPostClassifierRemoteAttempt,
} from './application-attempt.mts'
import { claimPostClassifierApplication } from './application-claim.mts'
import { reservePostClassifierApplication } from './application-reservation.mts'
import { supersedeStalePostClassifierApplication } from './application-supersession.mts'

describe('post classifier application supersession', () => {
  let release: (() => Promise<void>) | undefined
  beforeAll(async () => {
    release = await initializePostClassifierExecutionTests()
  })
  afterAll(async () => release?.())

  it('reactivates exact A after A→B→A without resetting terminal failure or attempt identity', async () => {
    const { post, community, lease } = await createPostClassifierExecutionFixture(true, true)
    expect(await startPostClassifierProviderAttempt({ ...lease, maxAttempts: 1 })).toBe('started')
    expect(
      await failPostClassifierRemoteAttempt({
        ...lease,
        maxAttempts: 1,
        failureKind: 'provider-error',
      }),
    ).toBe('terminal')
    const [original] = await getPostClassifierApplicationFacts(post.id)
    await setPostClassifierToggleForTest(community.id, 'self-promotion', false)
    const replacement = await supersedeStalePostClassifierApplication({
      ...lease,
      configurationSha256: lease.resolved.configurationSha256,
    })
    expect(replacement?.applicationId).not.toBe(lease.applicationId)
    expect(
      (await getPostClassifierApplicationFacts(post.id)).find(row => row.id === lease.applicationId)
        ?.superseded_at,
    ).toBeInstanceOf(Date)

    await setPostClassifierToggleForTest(community.id, 'self-promotion', true)
    const reactivated = await reservePostClassifierApplication(
      post.id,
      lease.detectorPackageVersion,
    )
    expect(reactivated?.applicationId).toBe(lease.applicationId)
    const current = (await getPostClassifierApplicationFacts(post.id)).find(
      row => row.id === lease.applicationId,
    )
    expect(current).toMatchObject({
      superseded_at: null,
      decision_batch_id: original?.decision_batch_id,
      provider_attempts_started: 1,
      terminal_remote_failed_at: original?.terminal_remote_failed_at,
    })
    expect(await claimPostClassifierApplication({ ...lease, leaseSeconds: 60 })).toEqual({
      kind: 'terminal',
    })
  })
})
