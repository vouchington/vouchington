import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  expireTestPostModerationVersion,
  insertTestPost,
  makeTestPostModerationWorkAvailable,
  safeUsername,
} from '@voucha/test-helpers'
import {
  expireTestPostModerationWorkLease,
  getTestPostModerationAttemptStateForPost,
  getTestPostModerationWorkAttemptCount,
  getTestPostModerationWorkHoldMs,
} from '@voucha/test-helpers/post-moderation-attempt-state'
import {
  beginPostModerationAttempt,
  failPostModerationAttempt,
  releasePostModerationAttemptForRateLimit,
} from './moderation-ledger.mts'

describe('post moderation ledger provider rate limits', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser({ username: safeUsername('ledger-rate-limit') })
    userId = user.id
  })

  async function insertPendingPost(label: string): Promise<string> {
    return insertTestPost({
      title: `ledger-${label}-${crypto.randomUUID()}`,
      slug: `ledger-${label}-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })
  }

  it('gives back an attempt the provider rejected with a 429 and holds the work for its wait', async () => {
    const postId = await insertPendingPost('release')
    const first = await beginPostModerationAttempt(postId, 'openai_omni')
    expect(first?.attempt_number).toBe(1)

    await expect(releasePostModerationAttemptForRateLimit(first!, 30_000)).resolves.toBe(true)

    expect(await getTestPostModerationWorkAttemptCount(postId, 'openai_omni')).toBe(0)
    expect(await getTestPostModerationAttemptStateForPost(postId, 'openai_omni')).toBeNull()
    const holdMs = await getTestPostModerationWorkHoldMs(postId, 'openai_omni')
    expect(holdMs).toBeGreaterThan(25_000)
    expect(holdMs).toBeLessThanOrEqual(30_000)
    // The lease is gone and the reconciler or a requeued job cannot claim the work early.
    await expect(beginPostModerationAttempt(postId, 'openai_omni')).resolves.toBeNull()
    // A second withdrawal of the same attempt is fenced out.
    await expect(releasePostModerationAttemptForRateLimit(first!, 30_000)).resolves.toBe(false)

    await makeTestPostModerationWorkAvailable(first!.version_id, 'openai_omni')
    const retry = await beginPostModerationAttempt(postId, 'openai_omni')
    expect(retry?.attempt_number).toBe(1)
    expect(await getTestPostModerationWorkAttemptCount(postId, 'openai_omni')).toBe(1)
  })

  it('leaves a lease another worker has taken over untouched', async () => {
    const postId = await insertPendingPost('reclaimed')
    const stale = await beginPostModerationAttempt(postId, 'openai_omni')
    await expireTestPostModerationWorkLease(stale!.version_id, 'openai_omni')
    const current = await beginPostModerationAttempt(postId, 'openai_omni')
    expect(current?.attempt_number).toBe(2)

    await expect(releasePostModerationAttemptForRateLimit(stale!, 30_000)).resolves.toBe(false)

    expect(await getTestPostModerationWorkAttemptCount(postId, 'openai_omni')).toBe(2)
    const state = await getTestPostModerationAttemptStateForPost(postId, 'openai_omni')
    expect(state?.work_lease_token).toBe(current!.lease_token)
    // The worker that holds the lease can still give its attempt back.
    await expect(releasePostModerationAttemptForRateLimit(current!, 30_000)).resolves.toBe(true)
    expect(await getTestPostModerationWorkAttemptCount(postId, 'openai_omni')).toBe(1)
  })

  it('does not spend any of the three attempts that end in staff review', async () => {
    const postId = await insertPendingPost('budget')
    let versionId = ''
    for (let rateLimited = 0; rateLimited < 4; rateLimited++) {
      const attempt = await beginPostModerationAttempt(postId, 'openai_omni')
      versionId = attempt!.version_id
      await releasePostModerationAttemptForRateLimit(attempt!, 1_000)
      await makeTestPostModerationWorkAvailable(versionId, 'openai_omni')
    }

    const outcomes: boolean[] = []
    for (const expectedAttempt of [1, 2, 3]) {
      const attempt = await beginPostModerationAttempt(postId, 'openai_omni')
      expect(attempt?.attempt_number).toBe(expectedAttempt)
      const failure = await failPostModerationAttempt(attempt!, 'provider_error')
      outcomes.push(failure.exhausted)
      await makeTestPostModerationWorkAvailable(versionId, 'openai_omni')
    }
    expect(outcomes).toEqual([false, false, true])
  })

  it('never holds the work past the version hard deadline', async () => {
    const postId = await insertPendingPost('deadline')
    const attempt = await beginPostModerationAttempt(postId, 'openai_omni')
    await expireTestPostModerationVersion(attempt!.version_id)

    await expect(releasePostModerationAttemptForRateLimit(attempt!, 900_000)).resolves.toBe(true)

    expect(await getTestPostModerationWorkHoldMs(postId, 'openai_omni')).toBeLessThanOrEqual(0)
  })
})
