import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { runWithCapturedQueries } from '@data-stores/psql/query-capture'
import { createFixtureTargets } from '@voucha/test-helpers/copyright-restoration-hold-targets'
import { createTestCopyrightImageFixture } from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { getTestMediaDeliveryRegistryRecordId } from '@voucha/test-helpers/entities/image-surface-placements'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { raceCopyrightFilingWithReactivation } from '@voucha/test-helpers/copyright-filing-reactivation-race'
import { appendCopyrightLegalHoldAssessment } from './holds.mts'
import { processCopyrightActionIntent } from './action-delivery-process.mts'
import {
  mediaDeliveryEdgeEnvironment,
  readMediaDeliveryRegistryItem,
} from '@voucha/test-helpers/media-delivery-emulator'
import { getImagePlacementDeliveryKey } from '@ts-shared/url-signing'
import { updateProfileImageId } from '../my/identity.mts'
import { getImagePlacementForCopyright } from '@services/images/placements'
import {
  stageImagePlacementDeliveryRecord,
  processMediaDeliveryRegistryRecord,
  publishStagedMediaDeliveryRecord,
} from '@services/media-delivery-safety'
import { resolveCopyrightImagePlacement } from './placement-resolution.mts'
import { issueCopyrightGuestCapability } from './guest-capabilities.mts'
import { appendCopyrightGuestFiling } from './guest-filings.mts'
import { copyrightSweepConfig } from './work-limits.mts'

describe('court filing denial and profile reactivation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  it('creates filing-origin withholding without fabricating a notice assessment', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const surface = await createTestCopyrightImageFixture('user-profile-image')
    const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })
    const resolved = await resolveCopyrightImagePlacement(surface.selector)
    const now = new Date()
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: now,
      claimantUserId: null,
      claimantDisplayName: 'Claimant',
      claimantContactCiphertext: `contact-${crypto.randomUUID()}`,
      workDescription: 'A copyrighted profile image.',
      policyVersion: 'test-v1',
      initialSubmission: {
        kind: 'notice',
        sourceKind: 'email',
        bodyCiphertext: `body-${crypto.randomUUID()}`,
      },
      targets: [resolved],
    })
    const capability = await issueCopyrightGuestCapability({
      currentUser: moderator,
      noticeId: notice.id,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    })
    const before = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(before?.assessments).toEqual([])
    expect(before?.restrictions).toEqual([])
    expect(before?.actionIntents).toEqual([])
    await expect(
      appendCopyrightGuestFiling({
        noticeId: notice.id,
        token: capability.token,
        now,
        kind: 'court_or_ccb_hold',
        statement: 'A federal court proceeding has commenced.',
      }),
    ).resolves.toMatchObject({ kind: 'court_or_ccb_hold' })
    const after = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(after?.assessments).toEqual([])
    expect(after?.restrictions).toContainEqual(
      expect.objectContaining({
        authorizing_assessment_id: null,
        copyright_notice_submission_id: expect.any(String),
        lifted_at: null,
      }),
    )
    expect(after?.actionIntents).toContainEqual(
      expect.objectContaining({ action: 'withhold', state: 'pending' }),
    )
    expect(after?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toHaveLength(1)
    expect(
      after?.lifecycleEvents.filter(row => row.change_type === 'court_or_ccb_hold_received'),
    ).toHaveLength(1)
  })
  it('denies a same-placement revision activated after filing reads its tuples', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const surface = await createTestCopyrightImageFixture('user-profile-image')
    const moderator = await createTestUserDirect({ extraRoles: ['moderator'] })
    const resolved = await resolveCopyrightImagePlacement(surface.selector)
    const now = new Date()
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: now,
      claimantUserId: null,
      claimantDisplayName: 'Claimant',
      claimantContactCiphertext: `contact-${crypto.randomUUID()}`,
      workDescription: 'A copyrighted profile image.',
      policyVersion: 'test-v1',
      initialSubmission: {
        kind: 'notice',
        sourceKind: 'email',
        bodyCiphertext: `body-${crypto.randomUUID()}`,
      },
      targets: [resolved],
    })
    const capability = await issueCopyrightGuestCapability({
      currentUser: moderator,
      noticeId: notice.id,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    })
    const oldTuple = {
      placementId: surface.placementId,
      revision: surface.placementRevision,
      imageId: surface.imageId,
    }
    const oldKey = getImagePlacementDeliveryKey(oldTuple)
    const { mediaDeliveryRegistryRecordId: oldRecordId } = await stageImagePlacementDeliveryRecord({
      ...oldTuple,
      state: 'allow',
    })
    await publishStagedMediaDeliveryRecord(oldRecordId)
    expect(await readMediaDeliveryRegistryItem(oldKey)).toMatchObject({ state: 'allow' })
    await updateProfileImageId(surface.actorUserId, null)
    await publishStagedMediaDeliveryRecord(oldRecordId)
    expect(await readMediaDeliveryRegistryItem(oldKey)).toMatchObject({ state: 'withheld' })
    expect((await getImagePlacementForCopyright(surface.placementId))?.deleted).toBe(true)
    let key = ''
    const outcomes = await raceCopyrightFilingWithReactivation({
      noticeId: notice.id,
      filing: () =>
        appendCopyrightGuestFiling({
          noticeId: notice.id,
          token: capability.token,
          now,
          kind: 'court_or_ccb_hold',
          statement: 'A federal court proceeding has commenced.',
        }),
      reactivate: async () => {
        await updateProfileImageId(surface.actorUserId, surface.imageId)
        const tuple = await getImagePlacementForCopyright(surface.placementId)
        if (!tuple) throw new Error('Reactivated placement disappeared')
        expect(tuple.revision).toBeGreaterThan(surface.placementRevision)
        const identity = {
          placementId: tuple.placementId,
          revision: tuple.revision,
          imageId: tuple.imageId,
        }
        key = getImagePlacementDeliveryKey(identity)
        const { mediaDeliveryRegistryRecordId } = await stageImagePlacementDeliveryRecord({
          ...identity,
          state: 'allow',
        })
        await expect(
          processMediaDeliveryRegistryRecord(mediaDeliveryRegistryRecordId),
        ).resolves.toBe('completed')
      },
    })
    expect(outcomes[0].status).toBe('fulfilled')
    expect(outcomes[1]).toEqual({ status: 'fulfilled', value: undefined })
    const after = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(after?.submissions.filter(row => row.kind === 'court_or_ccb_hold')).toHaveLength(1)
    expect(
      after?.lifecycleEvents.filter(row => row.change_type === 'court_or_ccb_hold_received'),
    ).toHaveLength(1)
    expect(await readMediaDeliveryRegistryItem(key)).toMatchObject({ state: 'withheld' })
    if (outcomes[0].status !== 'fulfilled') throw new Error('Filing failed')
    const target = after?.targets[0]
    if (!target) throw new Error('Filing target disappeared')
    await appendCopyrightLegalHoldAssessment({
      currentUser: moderator,
      submissionId: outcomes[0].value.id,
      assessedAt: new Date(),
      fromOriginalClaimant: false,
      proceedingKind: null,
      ccbClaimKind: null,
      commencedAt: null,
      receivedByDesignatedAgentAt: null,
      sameMaterial: false,
      targetIds: [target.id],
      rationale: 'The filing does not establish a qualifying legal hold.',
    })
    const ready = await getCopyrightNoticePrivateAggregate(notice.id)
    const restore = ready?.actionIntents.find(
      row => row.action === 'restore' && row.state === 'pending',
    )
    if (!restore) throw new Error('Reactivated placement did not receive current restoration work')
    await expect(processCopyrightActionIntent(restore.id, new Date())).resolves.toBe('applied')
    const visible = await getImagePlacementForCopyright(surface.placementId)
    if (!visible) throw new Error('Restored placement disappeared')
    expect(visible.withheld).toBe(false)
    expect(
      await readMediaDeliveryRegistryItem(
        getImagePlacementDeliveryKey({
          placementId: visible.placementId,
          revision: visible.revision,
          imageId: visible.imageId,
        }),
      ),
    ).toMatchObject({ state: 'allow' })
  })

  it('stages identical court filing denials across multi-page and single-page target batches', async () => {
    for (const [key, value] of Object.entries(await mediaDeliveryEdgeEnvironment()))
      vi.stubEnv(key, value)
    const [claimant, moderator] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect({ extraRoles: ['moderator'] }),
    ])
    const now = new Date()

    async function runFiling(batchSize: number) {
      const targets = await createFixtureTargets(claimant.id, 3)
      const notice = await createCopyrightNoticeAggregate({
        jurisdiction: 'us_dmca',
        receivedAt: now,
        claimantUserId: null,
        claimantDisplayName: 'Claimant',
        claimantContactCiphertext: `contact-${crypto.randomUUID()}`,
        workDescription: 'Multi-image post under court filing.',
        policyVersion: 'test-v1',
        initialSubmission: {
          kind: 'notice',
          sourceKind: 'email',
          bodyCiphertext: `body-${crypto.randomUUID()}`,
        },
        targets,
      })
      const capability = await issueCopyrightGuestCapability({
        currentUser: moderator,
        noticeId: notice.id,
        issuedAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60_000),
      })
      const restore = overrideDynamicConfigFieldsForTest(copyrightSweepConfig, {
        batch_size: batchSize,
      })
      onTestFinished(restore)
      try {
        const captured = await runWithCapturedQueries(() =>
          appendCopyrightGuestFiling({
            noticeId: notice.id,
            token: capability.token,
            now,
            kind: 'court_or_ccb_hold',
            statement: 'A federal court proceeding covers all targets.',
          }),
        )
        const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
        const denialStates = await Promise.all(
          targets.map(async target => {
            const current = await getImagePlacementForCopyright(target.placementId)
            const recordId = current ? await getTestMediaDeliveryRegistryRecordId(current) : null
            if (recordId) await publishStagedMediaDeliveryRecord(recordId)
            const item = current
              ? await readMediaDeliveryRegistryItem(getImagePlacementDeliveryKey(current))
              : null
            return { withheld: current?.withheld ?? false, state: item?.state ?? null }
          }),
        )
        return {
          denialReadCount: captured.queries.filter(q =>
            q.text.includes('denyCopyrightCourtFilingPlacements:current'),
          ).length,
          restrictionCount: aggregate?.restrictions.length ?? 0,
          withholdIntentCount:
            aggregate?.actionIntents.filter(i => i.action === 'withhold').length ?? 0,
          denialStates,
        }
      } finally {
        restore()
      }
    }

    const multiPage = await runFiling(2)
    const singlePage = await runFiling(100)
    expect(multiPage.denialReadCount).toBe(2)
    expect(singlePage.denialReadCount).toBe(1)
    expect(multiPage.restrictionCount).toBe(3)
    expect(multiPage.withholdIntentCount).toBe(3)
    expect(multiPage.restrictionCount).toBe(singlePage.restrictionCount)
    expect(multiPage.withholdIntentCount).toBe(singlePage.withholdIntentCount)
    expect(multiPage.denialStates).toEqual(singlePage.denialStates)
    expect(multiPage.denialStates).toEqual(
      Array.from({ length: 3 }, () => ({ withheld: true, state: 'withheld' })),
    )
  })
})
