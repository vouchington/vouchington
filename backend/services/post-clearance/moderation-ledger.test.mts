import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  expireTestPostModerationVersion,
  getTestPostModerationRetryDelayMinutes,
  getPostClearanceStatus,
  insertTestPost,
  makeTestPostModerationWorkAvailable,
  safeUsername,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import {
  beginPostModerationAttempt,
  completePostModerationAttempt,
  ensureCurrentPostModerationVersion,
  failPostModerationAttempt,
  reconcilePostModerationWork,
  recordPostModerationDisposition,
} from './moderation-ledger.mts'
import { checkPostClearance } from './check-clearance.mts'

describe('post moderation ledger', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser({ username: safeUsername('moderation-ledger') })
    userId = user.id
  })

  it('approves only after every automated source passes for the current version', async () => {
    const postId = await insertTestPost({
      title: `ledger-pass-${crypto.randomUUID()}`,
      slug: `ledger-pass-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)

    await recordPostModerationDisposition({
      versionId: version.id,
      source: 'openai_omni',
      disposition: 'pass',
      reasonCode: 'provider_pass',
    })
    await checkPostClearance(postId)
    expect(await getPostClearanceStatus(postId)).toBe('pending')

    await recordPostModerationDisposition({
      versionId: version.id,
      source: 'spam_detection',
      disposition: 'pass',
      reasonCode: 'provider_pass',
    })
    await checkPostClearance(postId)
    expect(await getPostClearanceStatus(postId)).toBe('approved')
  })

  it('routes suspicious automated signals to review without auto-rejecting', async () => {
    const postId = await insertTestPost({
      title: `ledger-review-${crypto.randomUUID()}`,
      slug: `ledger-review-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)
    await Promise.all([
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'openai_omni',
        disposition: 'review',
        reasonCode: 'provider_flagged',
      }),
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'spam_detection',
        disposition: 'pass',
        reasonCode: 'provider_pass',
      }),
    ])

    await checkPostClearance(postId)
    expect(await getPostClearanceStatus(postId)).toBe('in_review')
  })

  it('auto-rejects only an explicit deterministic child-safety disposition', async () => {
    const postId = await insertTestPost({
      title: `ledger-reject-${crypto.randomUUID()}`,
      slug: `ledger-reject-${crypto.randomUUID()}`,
      markdown: 'blocked content',
      createdById: userId,
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)
    await Promise.all([
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'openai_omni',
        disposition: 'reject',
        reasonCode: 'sexual_minors',
      }),
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'spam_detection',
        disposition: 'pass',
        reasonCode: 'provider_pass',
      }),
    ])

    await checkPostClearance(postId)
    expect(await getPostClearanceStatus(postId)).toBe('rejected')
  })

  it('refuses automated reject dispositions outside the child-safety policy', async () => {
    const postId = await insertTestPost({
      title: `ledger-reject-guard-${crypto.randomUUID()}`,
      slug: `ledger-reject-guard-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)

    await expect(
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'spam_detection',
        disposition: 'reject',
        reasonCode: 'spam_score',
      }),
    ).rejects.toThrow(/post_moderation_dispositions_check/i)

    await expect(
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'openai_omni',
        disposition: 'reject',
        reasonCode: 'provider_flagged',
      }),
    ).rejects.toThrow(/post_moderation_dispositions_check/i)
  })

  it('ignores dispositions from a superseded content version', async () => {
    const postId = await insertTestPost({
      title: `ledger-stale-${crypto.randomUUID()}`,
      slug: `ledger-stale-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)
    await Promise.all([
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'openai_omni',
        disposition: 'reject',
        reasonCode: 'sexual_minors',
      }),
      recordPostModerationDisposition({
        versionId: version.id,
        source: 'spam_detection',
        disposition: 'pass',
        reasonCode: 'provider_pass',
      }),
    ])

    await setPostLLMModerationContentSha256(postId, randomBytes(32))
    await checkPostClearance(postId)
    expect(await getPostClearanceStatus(postId)).toBe('pending')
  })

  it('owns T+5/T+20 retries in PostgreSQL and fences late completions', async () => {
    const postId = await insertTestPost({
      title: `ledger-retries-${crypto.randomUUID()}`,
      slug: `ledger-retries-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })

    const first = await beginPostModerationAttempt(postId, 'openai_omni')
    expect(first?.attempt_number).toBe(1)
    await expect(failPostModerationAttempt(first!, 'provider_error')).resolves.toEqual({
      recorded: true,
      exhausted: false,
    })
    await expect(
      completePostModerationAttempt(first!, {
        disposition: 'pass',
        reasonCode: 'late_provider_pass',
      }),
    ).resolves.toBe(false)

    expect(await getTestPostModerationRetryDelayMinutes(postId, 'openai_omni')).toBe(5)

    await makeTestPostModerationWorkAvailable(first!.version_id, 'openai_omni')
    const second = await beginPostModerationAttempt(postId, 'openai_omni')
    expect(second?.attempt_number).toBe(2)
    await failPostModerationAttempt(second!, 'provider_error')
    expect(await getTestPostModerationRetryDelayMinutes(postId, 'openai_omni')).toBe(20)

    await makeTestPostModerationWorkAvailable(first!.version_id, 'openai_omni')
    const third = await beginPostModerationAttempt(postId, 'openai_omni')
    expect(third?.attempt_number).toBe(3)
    await expect(failPostModerationAttempt(third!, 'provider_error')).resolves.toEqual({
      recorded: true,
      exhausted: true,
    })
  })

  it('moves unresolved current-version work to review at the hard deadline', async () => {
    const postId = await insertTestPost({
      title: `ledger-deadline-${crypto.randomUUID()}`,
      slug: `ledger-deadline-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)
    await expireTestPostModerationVersion(version.id)

    const reconciliation = await reconcilePostModerationWork()
    expect(reconciliation.exhausted_post_ids).toContain(postId)
    await checkPostClearance(postId)
    expect(await getPostClearanceStatus(postId)).toBe('in_review')
  })
})
