import { randomBytes } from 'node:crypto'
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postClearanceWorkConfig } from './work-limits.mts'
import { backgroundQueue as openAiModerationQueue } from '@voucha/test-helpers/shared-background-queue'
import {
  createTestUser,
  expireTestPostModerationVersion,
  getPostClearanceStatus,
  insertTestPost,
  safeUsername,
  setPostLLMModerationContentSha256,
} from '@voucha/test-helpers'
import { countTestPostModerationIncompleteWork } from '@voucha/test-helpers/post-moderation-attempt-state'
import { isDeduplicatedEnqueue } from '@voucha/test-helpers/queue-jobs'
import {
  beginPostModerationAttempt,
  completePostModerationAttempt,
  enqueuePostModerationRecovery,
  ensureCurrentPostModerationVersion,
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

  it('reuses one attempt and one stable job id', async () => {
    const postId = await insertTestPost({
      title: `ledger-retries-${crypto.randomUUID()}`,
      slug: `ledger-retries-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })

    const first = await beginPostModerationAttempt(postId, 'openai_omni')
    const second = await beginPostModerationAttempt(postId, 'openai_omni')
    expect(first?.attempt_number).toBe(1)
    expect(second).toMatchObject({ id: first?.id, attempt_number: 1 })
    const job = await openAiModerationQueue.getJob(`${first!.version_id}__openai_omni`)
    expect(job?.data).toEqual({ versionId: first!.version_id })
    await expect(
      completePostModerationAttempt(first!, { disposition: 'pass', reasonCode: 'provider_pass' }),
    ).resolves.toBe(true)
    await expect(
      completePostModerationAttempt(first!, { disposition: 'pass', reasonCode: 'provider_pass' }),
    ).resolves.toBe(false)
  })

  it('re-enqueues a committed version that lost its job without another disposition', async () => {
    const postId = await insertTestPost({
      title: `ledger-recovery-${crypto.randomUUID()}`,
      slug: `ledger-recovery-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)
    expect(await openAiModerationQueue.getJob(`${version.id}__openai_omni`)).toBeFalsy()

    const page = await reconcilePostModerationWork(undefined, [postId])
    expect(page.due).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ version_id: version.id, source: 'openai_omni' }),
        expect.objectContaining({ version_id: version.id, source: 'spam_detection' }),
      ]),
    )
    const enqueued = await enqueuePostModerationRecovery(version.id, 'openai_omni')
    expect(isDeduplicatedEnqueue(enqueued)).toBe(false)
    const again = await enqueuePostModerationRecovery(version.id, 'openai_omni')
    expect(isDeduplicatedEnqueue(again)).toBe(true)
    expect(await countTestPostModerationIncompleteWork(postId)).toBe(2)
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

    const reconciliation = await reconcilePostModerationWork(undefined, [postId])
    expect(reconciliation.exhausted_post_ids).toContain(postId)
    await checkPostClearance(postId)
    expect(await getPostClearanceStatus(postId)).toBe('in_review')
  })
  it('expires one configured page and resumes after the exact source within a version', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(postClearanceWorkConfig, {
        reconciliation_batch_size: 1,
      }),
    )
    const postId = await insertTestPost({
      title: `ledger-bound-${crypto.randomUUID()}`,
      slug: `ledger-bound-${crypto.randomUUID()}`,
      markdown: 'ordinary content',
      createdById: userId,
      clearanceStatus: 'pending',
    })
    const version = await ensureCurrentPostModerationVersion(postId)
    await expireTestPostModerationVersion(version.id)
    expect(await countTestPostModerationIncompleteWork(postId)).toBe(2)
    const first = await reconcilePostModerationWork(undefined, [postId])
    expect(first).toMatchObject({ exhausted_post_ids: [postId], due: [], hasMore: true })
    expect(first.nextCursor?.afterVersionId).toBe(version.id)
    expect(await countTestPostModerationIncompleteWork(postId)).toBe(1)
    const last = await reconcilePostModerationWork(undefined, [postId], first.nextCursor)
    expect(last).toMatchObject({ exhausted_post_ids: [postId], due: [], hasMore: false })
    expect(await countTestPostModerationIncompleteWork(postId)).toBe(0)
  })
})
