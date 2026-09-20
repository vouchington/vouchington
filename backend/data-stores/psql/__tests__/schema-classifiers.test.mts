import { afterAll, describe, expect, it } from 'vitest'
import { createClassifierFixture } from '../../../test-helpers/data-stores/psql/classifiers.mts'
import { onGracefulShutdown } from '../index.mts'

describe('classifier schema constraints', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('keeps candidate identity concrete and unique', async () => {
    const fixture = await createClassifierFixture()

    await expect(fixture.rejectCrossKindCandidate()).rejects.toMatchObject({ code: '23503' })
    await expect(fixture.rejectBothEntityCandidate()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectNoEntityCandidate()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectDuplicateCandidate()).rejects.toMatchObject({ code: '23505' })
  })

  it('enforces inherited threshold pairs and immutable prompt content', async () => {
    const fixture = await createClassifierFixture()

    await expect(fixture.rejectInvalidInheritedThreshold()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectDefaultThresholdUpdate()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectCandidateThresholdUpdate()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectCandidateThresholdIdentityMutation()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(fixture.rejectActiveThresholdWithDeactivatedActor()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(fixture.rejectThresholdAuditActorRemoval()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(fixture.rejectPromptIdentityMutation()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectClassifierIdentityMutation()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(fixture.rejectClassifierIdMutation()).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.activateClassifier()).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.activatePrompt()).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.deactivateClassifier()).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.deactivatePrompt()).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.getActivationLifecycleFacts()).resolves.toEqual({
      classifier_retained_activation: true,
      prompt_retained_activation: true,
    })
  })

  it('allows community overrides only for global candidates', async () => {
    const fixture = await createClassifierFixture()

    await expect(fixture.rejectActiveCommunityOverrideWithDisabledActor()).rejects.toMatchObject({
      code: '23514',
    })
    const firstLifecycle = await fixture.enableGlobalCandidateForCommunity()
    await expect(fixture.rejectCommunityOverrideAuditActorRemoval()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(fixture.enableGlobalCandidateForCommunity()).rejects.toMatchObject({
      code: '23505',
    })
    await expect(fixture.disableGlobalCandidateForCommunity()).resolves.toMatchObject({
      rowCount: 1,
    })
    await expect(
      fixture.rejectGlobalCandidateCommunityOverrideIdentityMutation(firstLifecycle.id),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      fixture.rejectGlobalCandidateCommunityOverrideReactivation(firstLifecycle.id),
    ).rejects.toMatchObject({ code: '23514' })
    const secondLifecycle = await fixture.enableGlobalCandidateForCommunity()
    const lifecycles = await fixture.getGlobalCandidateCommunityOverrideLifecycles()
    expect(lifecycles).toEqual([
      { ...firstLifecycle, active: false },
      { ...secondLifecycle, active: true },
    ])
    expect(secondLifecycle.id).not.toBe(firstLifecycle.id)
    await expect(fixture.rejectCommunityOverrideForLocalCandidate()).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('allows audit actor foreign keys to clear without mutating lifecycle history', async () => {
    const active = await createClassifierFixture()
    await active.enableGlobalCandidateForCommunity()
    await expect(active.deleteAuditUser()).resolves.toMatchObject({ rowCount: 1 })
    await expect(active.getCommunityThresholdAuditUsers()).resolves.toEqual({
      created_by_id: null,
      deactivated_by_id: null,
    })
    await expect(active.getGlobalCandidateCommunityOverrideAuditUsers()).resolves.toEqual([
      { enabled_by_id: null, disabled_by_id: null },
    ])

    const historical = await createClassifierFixture()
    await historical.deactivateCommunityThreshold()
    await historical.enableGlobalCandidateForCommunity()
    await historical.disableGlobalCandidateForCommunity()
    await expect(historical.rejectThresholdDeactivationActorRemoval()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(historical.rejectCommunityOverrideDisableActorRemoval()).rejects.toMatchObject({
      code: '23514',
    })
    await expect(historical.deleteAuditUser()).resolves.toMatchObject({ rowCount: 1 })
    await expect(historical.getCommunityThresholdAuditUsers()).resolves.toEqual({
      created_by_id: null,
      deactivated_by_id: null,
    })
    await expect(historical.getGlobalCandidateCommunityOverrideAuditUsers()).resolves.toEqual([
      { enabled_by_id: null, disabled_by_id: null },
    ])
  })

  it('keeps result lineage, candidate ownership, and append-only scope aligned', async () => {
    const fixture = await createClassifierFixture()
    const global = await fixture.createTopicBatch()

    await expect(
      fixture.insertTopicResult({ batchId: global.batchId, callId: global.callId }),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      fixture.rejectResultScopeMismatch(global.batchId, global.callId),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectBatchMutation(global.batchId)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(
      fixture.rejectBatchCandidateMutation(global.batchId, fixture.topicCandidateId),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      fixture.deleteBatchCandidate(global.batchId, fixture.topicCandidateId),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      fixture.rejectResultThresholdMismatch(global.batchId, global.callId),
    ).rejects.toMatchObject({ code: '23514' })
    const missingSnapshot = await fixture.createTopicBatchWithoutSnapshot()
    await expect(
      fixture.insertTopicResult({
        batchId: missingSnapshot.batch_id,
        callId: missingSnapshot.call_id,
      }),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      fixture.insertTopicResult({
        batchId: missingSnapshot.batch_id,
        callId: missingSnapshot.call_id,
        thresholdId: null,
      }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.rejectResultBeforeMismatchedSnapshot()).rejects.toMatchObject({
      code: '23503',
    })
    await expect(fixture.rejectCommunityResultScopeBeforeSnapshot()).rejects.toMatchObject({
      code: '23514',
    })

    const community = await fixture.createTopicBatch({ communityId: fixture.communityId })
    const inFlight = await fixture.createTopicBatch({ communityId: fixture.communityId })
    await expect(
      fixture.insertTopicResult({
        batchId: community.batchId,
        callId: community.callId,
        candidateId: fixture.communityCandidateId,
        topicId: fixture.communityTopicId,
        communityId: fixture.communityId,
      }),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.createReplacementCommunityThreshold()).rejects.toMatchObject({
      code: '23505',
    })
    await expect(fixture.deactivateCommunityThreshold()).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.createTopicBatch({ communityId: fixture.communityId })).rejects.toThrow(
      'classifier batch candidate capture requires exactly one active threshold',
    )
    const replacementThresholdId = await fixture.createReplacementCommunityThreshold()
    await expect(
      fixture.insertTopicResult({
        ...inFlight,
        candidateId: fixture.communityCandidateId,
        topicId: fixture.communityTopicId,
        communityId: fixture.communityId,
      }),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.getTopicResultThreshold(inFlight.batchId)).resolves.toEqual({
      threshold_id: fixture.communityThresholdId,
      effective_lower_threshold: '0.3000',
      effective_upper_threshold: '0.7500',
    })
    const replacement = await fixture.createTopicBatch({ communityId: fixture.communityId })
    await expect(
      fixture.insertTopicResult({
        ...replacement,
        candidateId: fixture.communityCandidateId,
        thresholdId: replacementThresholdId,
        effectiveLower: 0.35,
        topicId: fixture.communityTopicId,
        communityId: fixture.communityId,
      }),
    ).resolves.toMatchObject({ rowCount: 1 })
    const staleThreshold = await fixture.createTopicBatch({ communityId: fixture.communityId })
    await expect(
      fixture.insertTopicResult({
        ...staleThreshold,
        candidateId: fixture.communityCandidateId,
        thresholdId: fixture.communityThresholdId,
        effectiveLower: 0.3,
        topicId: fixture.communityTopicId,
        communityId: fixture.communityId,
      }),
    ).rejects.toMatchObject({ code: '23514' })
    const omittedThreshold = await fixture.createTopicBatch({ communityId: fixture.communityId })
    await expect(
      fixture.insertTopicResult({
        ...omittedThreshold,
        candidateId: fixture.communityCandidateId,
        thresholdId: null,
        effectiveLower: 0.25,
        topicId: fixture.communityTopicId,
        communityId: fixture.communityId,
      }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.deleteCommunityThreshold()).rejects.toMatchObject({ code: '23001' })
    const mismatchedThreshold = await fixture.createTopicBatch()
    await expect(
      fixture.insertTopicResult({
        ...mismatchedThreshold,
        thresholdId: replacementThresholdId,
      }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      fixture.insertTopicResult({
        batchId: global.batchId,
        callId: global.callId,
        candidateId: fixture.communityCandidateId,
        topicId: fixture.communityTopicId,
      }),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects stale capture when a threshold replacement commits first', async () => {
    const fixture = await createClassifierFixture()
    await using replacement = await fixture.holdThresholdReplacement()
    const captureError = fixture
      .createTopicBatch({ communityId: fixture.communityId })
      .catch(caught => caught)

    await expect.poll(replacement.hasBlockedOperation).toBe(true)
    await replacement.release()
    await expect(captureError).resolves.toMatchObject({ code: '23514' })

    const retry = await fixture.createTopicBatch({ communityId: fixture.communityId })
    await expect(
      fixture.insertTopicResult({
        ...retry,
        candidateId: fixture.communityCandidateId,
        thresholdId: replacement.thresholdId,
        effectiveLower: 0.35,
        topicId: fixture.communityTopicId,
        communityId: fixture.communityId,
      }),
    ).resolves.toMatchObject({ rowCount: 1 })
  })

  it('lets an in-flight capture commit before threshold replacement', async () => {
    const fixture = await createClassifierFixture()
    await using capture = await fixture.holdTopicBatchCapture()
    const replacementPending = fixture.holdThresholdReplacement()

    await expect.poll(capture.hasBlockedOperation).toBe(true)
    await capture.release()
    await using replacement = await replacementPending
    await replacement.release()

    await expect(
      fixture.insertTopicResult({
        batchId: capture.batchId,
        callId: capture.callId,
        candidateId: fixture.communityCandidateId,
        topicId: fixture.communityTopicId,
        communityId: fixture.communityId,
      }),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(fixture.getTopicResultThreshold(capture.batchId)).resolves.toEqual({
      threshold_id: fixture.communityThresholdId,
      effective_lower_threshold: '0.3000',
      effective_upper_threshold: '0.7500',
    })
  })
})
