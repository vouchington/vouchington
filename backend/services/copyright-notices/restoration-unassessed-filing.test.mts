import { assertFilingBlockedReplayDelivery } from '@voucha/test-helpers/copyright-filing-replay-delivery-outcome'
import {
  openRestorationWindow,
  recordCourtFiling,
} from '@voucha/test-helpers/copyright-unassessed-filing-scenes'
import { seedEvidenceHold } from '@voucha/test-helpers/copyright-evidence-hold-fixture'
import { assertEvidenceRestoreProbe } from '@voucha/test-helpers/copyright-evidence-restore-outcome'
import {
  assertUnassessedFilingGuard,
  assertNonqualifyingFilingOutcome,
} from '@voucha/test-helpers/copyright-unassessed-filing-outcomes'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { createCopyrightRestorationHoldFixture } from '@voucha/test-helpers/copyright-restoration-hold-fixtures'
import { readCopyrightStaffQueueCursorRows } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'

describe('unassessed court or CCB filings', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('queues an unassessed filing as urgent then returns it to ordinary work once assessed', async () => {
    expect.hasAssertions()
    const { moderator, notice, target } = await createCopyrightRestorationHoldFixture().then(
      fixture => ({
        ...fixture,
        target: fixture.aggregate.targets[0]!,
      }),
    )
    const filing = await recordCourtFiling(notice.id)
    expect((await readCopyrightStaffQueueCursorRows([notice.id]))[0]?.urgency).toBe(1)
    await assertNonqualifyingFilingOutcome(notice.id, {
      currentUser: moderator,
      submissionId: filing.id,
      assessedAt: new Date(),
      fromOriginalClaimant: false,
      proceedingKind: null,
      ccbClaimKind: null,
      commencedAt: null,
      receivedByDesignatedAgentAt: null,
      sameMaterial: false,
      targetIds: [target.id],
      rationale: 'No qualifying proceeding.',
    })
    const committed = await createCopyrightRestorationHoldFixture()
    const assessedFiling = await recordCourtFiling(committed.notice.id)
    await seedEvidenceHold({
      noticeId: committed.notice.id,
      currentUser: committed.moderator,
      submissionId: assessedFiling.id,
      assessedAt: new Date(),
      fromOriginalClaimant: false,
      proceedingKind: null,
      ccbClaimKind: null,
      commencedAt: null,
      receivedByDesignatedAgentAt: null,
      sameMaterial: false,
      targetIds: [committed.aggregate.targets[0]!.id],
      rationale: 'No qualifying proceeding.',
    })
    expect((await readCopyrightStaffQueueCursorRows([committed.notice.id]))[0]?.urgency).not.toBe(1)
  })

  it('does not block restoration when an otherwise qualifying filing was not from the original claimant', async () => {
    expect.hasAssertions()
    const { deadline, moderator, notice, now, restriction, target } = await openRestorationWindow()
    const filing = await recordCourtFiling(notice.id)
    await seedEvidenceHold({
      noticeId: notice.id,
      currentUser: moderator,
      submissionId: filing.id,
      assessedAt: now,
      fromOriginalClaimant: false,
      proceedingKind: 'federal_court',
      ccbClaimKind: null,
      commencedAt: new Date(now.getTime() - 120_000),
      receivedByDesignatedAgentAt: new Date(now.getTime() - 60_000),
      sameMaterial: true,
      targetIds: [target.id],
      rationale: 'Sender is not claimant or authorised agent.',
    })
    await assertEvidenceRestoreProbe(
      {
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now,
      },
      true,
    )
  })

  it.each([
    {
      label: 'an uncommenced threat',
      proceedingKind: null,
      fromOriginalClaimant: true,
      sameMaterial: true,
    },
    {
      label: 'a proceeding about different material',
      proceedingKind: 'federal_court' as const,
      fromOriginalClaimant: true,
      sameMaterial: false,
    },
  ])('creates a restore intent for $label', async testCase => {
    expect.hasAssertions()
    const { deadline, moderator, notice, now, restriction, target } = await openRestorationWindow()
    const filing = await recordCourtFiling(notice.id)
    const commencedAt = testCase.proceedingKind ? new Date(now.getTime() - 120_000) : null
    await seedEvidenceHold({
      noticeId: notice.id,
      currentUser: moderator,
      submissionId: filing.id,
      assessedAt: now,
      fromOriginalClaimant: testCase.fromOriginalClaimant,
      proceedingKind: testCase.proceedingKind,
      ccbClaimKind: null,
      commencedAt,
      receivedByDesignatedAgentAt: commencedAt ? new Date(now.getTime() - 60_000) : null,
      sameMaterial: testCase.sameMaterial,
      targetIds: [target.id],
      rationale: 'The assessment does not establish a qualifying same-material proceeding.',
    })

    await assertEvidenceRestoreProbe(
      {
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now,
      },
      true,
    )
  })

  it('does not block restoration for a qualifying hold received after the batch as-of time', async () => {
    expect.hasAssertions()
    const { deadline, moderator, notice, restriction, target } = await openRestorationWindow()
    const now = new Date(deadline.earliest_restoration_at.getTime() + 60_000)
    const wallNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const receivedByDesignatedAgentAt = new Date(wallNow.getTime() - 60_000)
    expect(receivedByDesignatedAgentAt.getTime()).toBeGreaterThan(now.getTime())

    const filing = await recordCourtFiling(
      notice.id,
      new Date(receivedByDesignatedAgentAt.getTime() - 60_000),
    )
    await seedEvidenceHold({
      noticeId: notice.id,
      currentUser: moderator,
      submissionId: filing.id,
      assessedAt: wallNow,
      fromOriginalClaimant: true,
      proceedingKind: 'federal_court',
      ccbClaimKind: null,
      commencedAt: new Date(receivedByDesignatedAgentAt.getTime() - 86_400_000),
      receivedByDesignatedAgentAt,
      sameMaterial: true,
      targetIds: [target.id],
      rationale: 'The designated agent received the commenced proceeding after this batch cutoff.',
    })

    await assertEvidenceRestoreProbe(
      {
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: restriction.id,
        deadlineId: deadline.id,
        expectedPlacementRevision: target.placement_revision,
        now,
      },
      true,
    )
  })

  it('blocks the case until an assessment records that the filing does not qualify', async () => {
    expect.hasAssertions()
    const { deadline, moderator, notice, now, restriction, target } = await openRestorationWindow()
    const filing = await recordCourtFiling(notice.id)
    const restore = {
      noticeId: notice.id,
      targetId: target.id,
      restrictionId: restriction.id,
      deadlineId: deadline.id,
      expectedPlacementRevision: target.placement_revision,
      now,
    }
    await assertUnassessedFilingGuard(restore)
    await seedEvidenceHold({
      noticeId: notice.id,
      currentUser: moderator,
      submissionId: filing.id,
      assessedAt: new Date('2026-07-02T13:01:00.000Z'),
      fromOriginalClaimant: false,
      proceedingKind: null,
      ccbClaimKind: null,
      commencedAt: null,
      receivedByDesignatedAgentAt: null,
      sameMaterial: false,
      targetIds: [target.id],
      rationale: 'The filing does not identify a commenced proceeding.',
    })
    await assertEvidenceRestoreProbe(restore, true)
  })

  it('blocks an already created restore until the filing is assessed, then reopens it', async () => {
    expect.hasAssertions()
    await assertFilingBlockedReplayDelivery()
  })
})
