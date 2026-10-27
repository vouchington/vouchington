import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createClassifierFixture } from '@voucha/test-helpers/data-stores/psql/classifiers'
import { supersedeActivePromptVersion } from '@voucha/test-helpers/data-stores/psql/classifier-threshold-management'
import { createSyntheticFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-classifier'
import { getClassifierRunRequestFacts } from '@voucha/test-helpers/data-stores/psql/classifier-runs/run-facts'
import {
  AUTOTAGGER_AGENT_SLUG,
  completeTaggingRunForTest,
} from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-agent-fixture'
import { createAutotaggerPostFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import {
  deleteClassifierCacheSubjectPost,
  deleteClassifierCacheIdentitiesForTest,
  probeVersionedClassifierCachePageForTest,
  probeClassifierRunRemovalRollback,
  readClassifierRetentionPricedUsage,
  retireClassifierRunPayloadForTest,
  seedClassifierCacheIdentity,
  seedClassifierCacheIdentityForSlug,
  seedClassifierRetentionPricedUsage,
} from '@voucha/test-helpers/classifier-cache-retention'
import {
  retireSupersededVersionedRunPayloadForTest,
  rollBackActivePromptVersionForTest,
} from '@voucha/test-helpers/classifier-prompt-rollback-retention'
import { withClassifierRetentionSweepLock } from '@voucha/test-helpers/classifier-retention-sweep-lock'
import {
  countClassifierRows,
  seedClassifierRunPayloadsAt,
} from '@voucha/test-helpers/classifier-retention'
import { listPendingClassifierRunRequests } from '../../classifier-runs/run-discovery.mts'
import { cleanupClassifierRecords } from '../cleanup-classifier-records.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('classifier retention cleanup', () => {
  it('retires an unreserved follow-on when its last completed first-stage payload is removed', async () => {
    const fixture = await createAutotaggerPostFixture()
    const { lease } = await completeTaggingRunForTest(fixture)
    const before = (await getClassifierRunRequestFacts(fixture.post.id, AUTOTAGGER_AGENT_SLUG))[0]!
    expect(before.stale_at).toBeNull()
    expect(before.run_settled_at).toBeNull()

    expect(await retireClassifierRunPayloadForTest(lease.runId)).toBe(1)

    const after = (await getClassifierRunRequestFacts(fixture.post.id, AUTOTAGGER_AGENT_SLUG))[0]!
    expect(after.id).toBe(before.id)
    expect(after.stale_at).not.toBeNull()
    expect(after.run_settled_at).toBeNull()
  })

  it('retires promptless cache identities with capped terminal payload deletion without reopening requests', async () => {
    const setup = await createSyntheticFixture()
    const at = new Date(Date.now() - 100 * DAY_MS)
    const { terminalIds, pendingId, requestId } = await seedClassifierRunPayloadsAt({
      slug: setup.slug,
      postId: setup.post.id,
      actorId: setup.actorId,
      currentInputSha256: setup.post.inputSha256,
      at,
      terminalCount: 3,
    })
    const { recordId, responseId } = await seedClassifierRetentionPricedUsage(terminalIds[0]!)
    const originalUsage = await readClassifierRetentionPricedUsage(recordId, responseId)
    expect(originalUsage).toMatchObject({
      classifier_run_identity_id: terminalIds[0],
      cost_microunits: '319',
      currency_code: 'usd',
      response_id: responseId,
    })
    const options = {
      retentionDays: 90,
      batchSize: 2,
      maxBatches: 1,
      lowerBoundDate: at,
      now: new Date(at.getTime() + 90 * DAY_MS + 1),
    }

    await withClassifierRetentionSweepLock(async () => {
      const atBoundary = await cleanupClassifierRecords({
        ...options,
        now: new Date(at.getTime() + 90 * DAY_MS),
      })
      expect(atBoundary.runs.deleted).toBe(0)
      expect(await countClassifierRows('classifier_runs', terminalIds)).toBe(3)

      const first = await cleanupClassifierRecords(options)
      expect(first.runs).toEqual({ scanned: 2, deleted: 2, hasMore: true })
      expect(await countClassifierRows('classifier_runs', terminalIds)).toBe(1)

      const second = await cleanupClassifierRecords(options)
      expect(second.runs).toEqual({ scanned: 2, deleted: 1, hasMore: false })
    })
    expect(await countClassifierRows('classifier_runs', terminalIds)).toBe(0)
    expect(await countClassifierRows('classifier_runs', [pendingId])).toBe(1)
    expect(await countClassifierRows('classifier_run_identities', terminalIds)).toBe(0)
    expect(await readClassifierRetentionPricedUsage(recordId, responseId)).toEqual({
      ...originalUsage,
      classifier_run_identity_id: null,
    })
    expect(await countClassifierRows('classifier_run_identities', [pendingId])).toBe(1)
    expect(await countClassifierRows('classifier_run_requests', [requestId])).toBe(1)
    const request = (await getClassifierRunRequestFacts(setup.post.id, setup.slug))[0]!
    expect(request.id).toBe(requestId)
    expect(request.run_identity_id).toBeNull()
    expect(request.run_settled_at).not.toBeNull()
    expect((await listPendingClassifierRunRequests(setup.adapter, null, 10)).items).toEqual([])
    expect(await countClassifierRows('classifier_runs', terminalIds)).toBe(0)
  })

  it('prunes only an older prompt version cache identity after a newer version activates', async () => {
    const startedAt = new Date()
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const inputSha256 = randomBytes(32)
    const oldId = await seedClassifierCacheIdentity({
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      postId: fixture.postId,
      inputSha256,
    })
    const nextPromptVersionId = await supersedeActivePromptVersion(
      fixture.classifierId,
      fixture.promptVersionId,
    )
    const newId = await seedClassifierCacheIdentity({
      classifierId: fixture.classifierId,
      promptVersionId: nextPromptVersionId,
      postId: fixture.postId,
      inputSha256,
    })

    try {
      expect(
        await probeVersionedClassifierCachePageForTest({
          classifierId: fixture.classifierId,
          oldPromptVersionId: fixture.promptVersionId,
          oldIdentityId: oldId,
          newIdentityId: newId,
          startedAt,
        }),
      ).toEqual({ scanned: 1, deleted: 1, oldInside: false, newInside: true })
      // The borrowed page rolled back, including the global cursor and the owned deletion.
      expect(await countClassifierRows('classifier_run_identities', [oldId, newId])).toBe(2)
    } finally {
      await deleteClassifierCacheIdentitiesForTest([oldId, newId])
    }
  })

  it('prunes superseded edits of one prompt version but keeps the subject newest identity', async () => {
    const startedAt = new Date()
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const seed = () =>
      seedClassifierCacheIdentity({
        classifierId: fixture.classifierId,
        promptVersionId: fixture.promptVersionId,
        postId: fixture.postId,
        inputSha256: randomBytes(32),
      })
    const oldId = await seed()
    const newId = await seed()
    try {
      expect(
        await probeVersionedClassifierCachePageForTest({
          classifierId: fixture.classifierId,
          oldPromptVersionId: fixture.promptVersionId,
          oldIdentityId: oldId,
          newIdentityId: newId,
          startedAt,
        }),
      ).toEqual({ scanned: 2, deleted: 1, oldInside: false, newInside: true })
    } finally {
      await deleteClassifierCacheIdentitiesForTest([oldId, newId])
    }
  })

  it('keeps the active prompt version identity after a newer version is rolled back', async () => {
    const startedAt = new Date()
    const fixture = await createClassifierFixture()
    await fixture.activateClassifierConfigurations()
    const identityId = await seedClassifierCacheIdentity({
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      postId: fixture.postId,
      inputSha256: randomBytes(32),
    })
    const nextPromptVersionId = await supersedeActivePromptVersion(
      fixture.classifierId,
      fixture.promptVersionId,
    )
    await rollBackActivePromptVersionForTest(nextPromptVersionId, fixture.promptVersionId)
    try {
      expect(
        await probeVersionedClassifierCachePageForTest({
          classifierId: fixture.classifierId,
          oldPromptVersionId: fixture.promptVersionId,
          oldIdentityId: identityId,
          newIdentityId: identityId,
          startedAt,
        }),
      ).toEqual({ scanned: 1, deleted: 0, oldInside: true, newInside: true })
    } finally {
      await deleteClassifierCacheIdentitiesForTest([identityId])
    }
  })

  it('retires the identity of a payload superseded before it completed', async () => {
    const fixture = await createClassifierFixture()
    const setup = await createSyntheticFixture()
    const retired = await retireSupersededVersionedRunPayloadForTest({
      classifierId: fixture.classifierId,
      promptVersionId: fixture.promptVersionId,
      postId: setup.post.id,
      actorId: setup.actorId,
      inputSha256: randomBytes(32),
      at: new Date(Date.now() - 100 * DAY_MS),
    })
    expect(retired.identityRemaining).toBe(0)
    expect(await countClassifierRows('classifier_runs', [retired.runId])).toBe(0)
  })

  it('prunes a cache identity when its real post is deleted despite a retained subject id', async () => {
    const startedAt = new Date()
    const setup = await createSyntheticFixture()
    const identityId = await seedClassifierCacheIdentityForSlug({
      slug: setup.slug,
      postId: setup.post.id,
      inputSha256: randomBytes(32),
    })
    await deleteClassifierCacheSubjectPost(setup.post.id)
    await cleanupClassifierRecords({
      retentionDays: 90,
      batchSize: 20,
      maxBatches: 5,
      lowerBoundDate: startedAt,
      now: new Date(Date.now() + 60_000),
    })
    expect(await countClassifierRows('classifier_run_identities', [identityId])).toBe(0)
  })

  it('rolls back both promptless payload and cache removal when their transaction aborts', async () => {
    const setup = await createSyntheticFixture()
    const at = new Date(Date.now() - 100 * DAY_MS)
    const { terminalIds, requestId } = await seedClassifierRunPayloadsAt({
      slug: setup.slug,
      postId: setup.post.id,
      actorId: setup.actorId,
      currentInputSha256: setup.post.inputSha256,
      at,
      terminalCount: 1,
    })
    const runId = terminalIds[0]!
    expect(await probeClassifierRunRemovalRollback(runId)).toEqual({
      removedRuns: 1,
      remainingIdentitiesInsideTransaction: 0,
    })
    expect(await countClassifierRows('classifier_runs', [runId])).toBe(1)
    expect(await countClassifierRows('classifier_run_identities', [runId])).toBe(1)
    const request = (await getClassifierRunRequestFacts(setup.post.id, setup.slug))[0]!
    expect(request.id).toBe(requestId)
    expect(request.run_identity_id).toBe(runId)
    expect(request.run_settled_at).not.toBeNull()
  })
})
