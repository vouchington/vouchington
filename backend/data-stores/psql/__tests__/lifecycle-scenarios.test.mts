import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestPostVote,
  insertTestReportAbusePenalty,
  insertTestReportIntegrityFlag,
  insertTestSavedPostCollection,
  insertTestUserWarning,
  insertTestVoteIntegrityFlag,
  insertTestVoteWeightPenaltyRecord,
  suspendTestUserGetId,
  WEB_PROVENANCE,
} from '../../../test-helpers/index.mts'
import {
  type LifecycleScenarioInput,
  type LifecycleScenarioObservation,
  getBackendExpectedObservation,
  getBackendLifecycleClaims,
} from '../../../test-helpers/lifecycle-scenarios.mts'
import { observeServerBoundary } from '../../../test-helpers/lifecycle-scenario-observation.mts'
import { rerunAppealResolutionThroughQueueForTest } from '../../../workers/ai-agents/processors/process-appeal-resolution.test-helpers.mts'
import { getUserPostsCollection as getCollection } from '../../../services/entity-fetch/profile-collections.mts'
import { approveModerationAppeal } from '../../../services/moderation-appeals/approve-appeal.mts'
import { createModerationAppeal } from '../../../services/moderation-appeals/create.mts'
import { dismissModerationAppeal } from '../../../services/moderation-appeals/dismiss-appeal.mts'
import { getModerationAppealByIdFromPrimary } from '../../../services/moderation-appeals/get.mts'
import { parseCreateModerationAppealInput } from '../../../services/moderation-appeals/parse.mts'
import { resolveModerationAppealAccept } from '../../../services/moderation-appeals/resolve.mts'
import { sendApprovedModerationAppealResolution } from '../../../services/moderation-appeals/send-appeal-resolution.mts'
import { updateModerationAppealDraft } from '../../../services/moderation-appeals/update-appeal-draft.mts'
import { applyReportAbusePenalty } from '../../../services/report-integrity/apply-penalty.mts'
import { getReportAbusePenaltyByIdFromPrimary as getReportPenalty } from '../../../services/report-integrity/get-penalties.mts'
import { getReportIntegrityFlagByIdFromPrimary as getReportFlag } from '../../../services/report-integrity/get-flags.mts'
import { resolveReportIntegrityFlag } from '../../../services/report-integrity/resolve-flag.mts'
import { revokeReportAbusePenalty } from '../../../services/report-integrity/revoke-penalty.mts'
import { applyVoteRingPenalty } from '../../../services/vote-integrity/apply-ring-penalty.mts'
import {
  getVoteWeightPenaltyByIdFromPrimary as getVotePenalty,
  getVoteWeightPenaltiesByFlagIdFromPrimary as getVotePenaltiesByFlag,
} from '../../../services/vote-integrity/get-penalties.mts'
import { revokeVoteWeightPenalty } from '../../../services/vote-integrity/revoke-penalty.mts'
import { parsePrivatePostCollectionScenario } from '../../../test-helpers/lifecycle-scenario-private-post.mts'
type BackendAdapter = (input: LifecycleScenarioInput) => Promise<LifecycleScenarioObservation>
const adapters: Record<string, BackendAdapter> = {
  'backend-moderation-appeal-service': runModerationAppealScenario,
  'backend-integrity-authority': runIntegrityAuthorityScenario,
  'backend-private-post-collection': runPrivatePostCollectionScenario,
}
describe('lifecycle scenario manifest backend adapters', () => {
  it('executes every backend claim exactly once', runBackendLifecycleContract)
})
async function runBackendLifecycleContract(): Promise<void> {
  const dispatches = new Map<string, number>()
  for (const { claim, scenario } of getBackendLifecycleClaims()) {
    const adapter = adapters[claim.adapter]
    if (!adapter) throw new Error(`Unknown backend lifecycle adapter: ${claim.adapter}`)
    const adapterFamily = `${scenario.id}:${claim.adapter}:${scenario.family}`
    dispatches.set(adapterFamily, (dispatches.get(adapterFamily) ?? 0) + 1)
    const observed = await adapter(scenario.input)
    expect(observed).toEqual(getBackendExpectedObservation(scenario))
  }
  expect(dispatches.size).toBe(getBackendLifecycleClaims().length)
  expect([...dispatches.values()]).toEqual(Array.from(dispatches, () => 1))
}
async function runModerationAppealScenario(
  input: LifecycleScenarioInput,
): Promise<LifecycleScenarioObservation> {
  const administrator = await createTestUser({ administrator: true })
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  const appellant = await createTestUser()
  const isSuspension = input.preconditions.appealType === 'suspension'
  const appeal = await createAppeal(administrator, appellant, isSuspension)
  const originalLifecycleId = appeal.latest_lifecycle_change_id
  if (input.action.type === 'rerun') {
    await rerunAppealResolutionThroughQueueForTest(administrator.id, appeal.id)
    const updated = await getModerationAppealByIdFromPrimary(appeal.id)
    return observeServerBoundary(
      {
        status: updated!.status,
        latestLifecycleChangeChanged: updated!.latest_lifecycle_change_id !== originalLifecycleId,
      },
      { strategy: 'server-response' },
    )
  }
  await updateModerationAppealDraft(administrator.id, appeal.id, {
    publicResponse: 'A human-reviewed response.',
  })
  if (input.action.type === 'approve') {
    const updated = await approveModerationAppeal(administrator.id, appeal.id)
    return observeServerBoundary(
      {
        status: updated.status,
        approved: updated.approved_at !== null,
        sent: updated.sent_at !== null,
        latestLifecycleChangeChanged: updated.latest_lifecycle_change_id !== originalLifecycleId,
      },
      { strategy: 'server-response' },
    )
  }
  await approveModerationAppeal(administrator.id, appeal.id)
  if (input.action.type === 'send') {
    const updated = await sendApprovedModerationAppealResolution(administrator.id, appeal.id)
    return observeServerBoundary(
      {
        status: updated.status,
        approved: updated.approved_at !== null,
        sent: updated.sent_at !== null,
        latestLifecycleChangeChanged: updated.latest_lifecycle_change_id !== originalLifecycleId,
      },
      { strategy: 'server-response' },
    )
  }
  await sendApprovedModerationAppealResolution(administrator.id, appeal.id)
  if (input.action.type === 'deny') {
    const updated = await dismissModerationAppeal(administrator.id, appeal.id)
    return observeServerBoundary(
      {
        status: updated.status,
        resolutionAction: updated.resolution_action,
        latestLifecycleChangeChanged: updated.latest_lifecycle_change_id !== originalLifecycleId,
      },
      { strategy: 'server-response' },
    )
  }
  if (input.action.type !== 'inspect-actions') {
    throw new Error(`Unknown backend moderation lifecycle action: ${input.action.type}`)
  }
  if (input.preconditions.viewerRole === 'moderator') {
    const status = await resolveModerationAppealAccept(moderator.id, appeal.id)
      .then(() => null)
      .catch((error: { status?: number }) => error.status)
    if (status !== 403)
      throw new Error(`Expected moderator suspension acceptance to fail with 403, got ${status}`)
    const persisted = await getModerationAppealByIdFromPrimary(appeal.id)
    return observeServerBoundary(
      { status: persisted!.status, viewerRole: 'moderator' },
      { strategy: 'not-applicable' },
    )
  }

  const probeAppellant = await createTestUser()
  const probe = await createAppeal(administrator, probeAppellant, true)
  await updateModerationAppealDraft(administrator.id, probe.id, {
    publicResponse: 'A human-reviewed response.',
  })
  await approveModerationAppeal(administrator.id, probe.id)
  await sendApprovedModerationAppealResolution(administrator.id, probe.id)
  await resolveModerationAppealAccept(administrator.id, probe.id)
  const resolvedProbe = await getModerationAppealByIdFromPrimary(probe.id)
  if (resolvedProbe?.status !== 'resolved' || resolvedProbe.resolution_action !== 'accept') {
    throw new Error('Administrator acceptance probe did not persist its authoritative final state')
  }
  const persisted = await getModerationAppealByIdFromPrimary(appeal.id)
  return observeServerBoundary(
    { status: persisted!.status, viewerRole: 'administrator' },
    { strategy: 'not-applicable' },
  )
}

async function createAppeal(
  administrator: NonNullable<Awaited<ReturnType<typeof createTestUser>>>,
  appellant: NonNullable<Awaited<ReturnType<typeof createTestUser>>>,
  suspension: boolean,
) {
  if (suspension) {
    await suspendTestUserGetId(appellant.id, 'Lifecycle scenario suspension')
    return (
      await createModerationAppeal(
        WEB_PROVENANCE,
        appellant,
        parseCreateModerationAppealInput({
          target_type: 'suspension',
          appeal_reason: 'Appeal reason.',
        }),
      )
    ).appeal
  }
  const warning = await insertTestUserWarning({
    userId: appellant.id,
    issuedById: administrator.id,
    reason: 'Lifecycle scenario warning',
  })
  return (
    await createModerationAppeal(
      WEB_PROVENANCE,
      appellant,
      parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: 'Appeal reason.',
      }),
    )
  ).appeal
}

async function runIntegrityAuthorityScenario(
  input: LifecycleScenarioInput,
): Promise<LifecycleScenarioObservation> {
  const administrator = await createTestUser({ administrator: true })
  const subject = await createTestUser()
  if (input.action.type === 'resolve-report') {
    const flagId = await insertTestReportIntegrityFlag({ reportedUserId: subject.id })
    await resolveReportIntegrityFlag(flagId, administrator.id, 'dismissed')
    const exact = await getReportFlag(flagId)
    return observeServerBoundary(
      { reportStatus: exact?.resolved_at ? 'resolved' : 'pending' },
      { strategy: 'exact-read', authority: 'primary' },
    )
  }
  if (input.action.type === 'apply-report-penalty') {
    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: subject.id,
      reporterUserIds: [subject.id],
    })
    const applied = await applyReportAbusePenalty(administrator.id, flagId)
    const exact = await Promise.all(applied.penalties.map(penalty => getReportPenalty(penalty.id)))
    return observeServerBoundary(
      { penaltyApplied: exact.length === 1 && exact[0]?.revoked_at === null },
      { strategy: 'exact-read', authority: 'primary' },
    )
  }
  if (input.action.type === 'apply-vote-penalty') {
    const postId = await insertTestPost({
      title: `Integrity ${subject.id}`,
      slug: `integrity-${subject.id}`,
      markdown: 'Integrity scenario',
      createdById: subject.id,
    })
    await insertTestPostVote(postId, subject.id, '127.0.0.1', 1)
    const flagId = await insertTestVoteIntegrityFlag({ postId })
    await applyVoteRingPenalty(flagId, administrator.id)
    const exact = await getVotePenaltiesByFlag({ sourceFlagId: flagId })
    return observeServerBoundary(
      {
        penaltyApplied: exact.results.length === 1 && exact.results[0]?.revoked_at === null,
      },
      { strategy: 'exact-read', authority: 'primary' },
    )
  }
  if (input.action.type === 'revoke-report-penalty') {
    const penaltyId = await insertTestReportAbusePenalty({
      userId: subject.id,
      createdById: administrator.id,
    })
    await revokeReportAbusePenalty(administrator.id, penaltyId)
    const exact = await getReportPenalty(penaltyId)
    return observeServerBoundary(
      { revoked: exact?.revoked_at !== null },
      { strategy: 'exact-read', authority: 'primary' },
    )
  }
  if (input.action.type !== 'revoke-vote-penalty') {
    throw new Error(`Unknown backend integrity lifecycle action: ${input.action.type}`)
  }
  const penaltyId = await insertTestVoteWeightPenaltyRecord({
    userId: subject.id,
    createdById: administrator.id,
  })
  await revokeVoteWeightPenalty(penaltyId, administrator.id)
  const exact = await getVotePenalty(penaltyId)
  return observeServerBoundary(
    { revoked: exact?.revoked_at !== null },
    { strategy: 'exact-read', authority: 'primary' },
  )
}
async function runPrivatePostCollectionScenario(
  input: LifecycleScenarioInput,
): Promise<LifecycleScenarioObservation> {
  const scenario = parsePrivatePostCollectionScenario(input)
  const owner = await createTestUser()
  const collection = await insertTestSavedPostCollection({
    ownerId: owner.id,
    visibleCount: scenario.preconditions.visibleCount,
    newerFilteredCount: scenario.preconditions.newerFilteredCount,
  })
  const first = await getCollection(owner, owner.id, 'saved', {
    limit: scenario.preconditions.limit,
  })
  const firstIds = first.results.map(post => post.id)
  expect(firstIds).not.toContain(collection.filteredPostId)
  if (scenario.action.type === 'fetch-first-page') {
    return observeServerBoundary(
      {
        visibleItemCount: firstIds.length,
        hasNextPage: first.page_info.has_next_page,
      },
      { strategy: 'filter-before-limit' },
    )
  }
  const second = await getCollection(owner, owner.id, 'saved', {
    limit: scenario.preconditions.limit,
    after: first.page_info.end_cursor!,
  })
  const ids = [...firstIds, ...second.results.map(post => post.id)]
  return observeServerBoundary(
    {
      duplicates: ids.length - new Set(ids).size,
      gaps: collection.visiblePostIds.filter(id => !ids.includes(id)).length,
    },
    { strategy: 'scoped-cursor' },
  )
}
