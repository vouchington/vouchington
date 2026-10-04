import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient, type CreateInvalidationCommandOutput } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient, type PutItemCommandOutput } from '@aws-sdk/client-dynamodb'
import { COPYRIGHT_CASE_TIMELINE_EVENT_TYPES } from '@services/account-data-requests/stream-copyright-cases'
import { getCopyrightPublicNoticeDetail } from '@services/copyright-notices/read-models'
import {
  createCopyrightAppeal,
  createCopyrightCounterNotice,
  createCopyrightFormIntake,
  reviewCopyrightFormIntake,
} from '@services/copyright-notices'
import { copyrightTimelineEventTypesFor } from '@services/copyright-notices/timeline-visibility'
import { createCopyrightFormFixture } from '@services/copyright-notices/route-test-fixtures'
import { createTestUser, hardDeleteTestUser } from '@voucha/test-helpers'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readAccountExport } from '@voucha/test-helpers/services/copyright-notices/read-account-export'

const COPYRIGHT_FILES = [
  'copyright-notices-filed.csv',
  'copyright-appeals.csv',
  'copyright-counter-notices.csv',
  'copyright-cases.csv',
  'copyright-repeat-infringer-incidents.csv',
  'copyright-repeat-infringer-reviews.csv',
]

describe('copyright records in the account data export', () => {
  useCopyrightIntakeEnvironment()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockImplementation(
      vi
        .fn<VitestLooseMock>()
        .mockResolvedValue({ $metadata: {} } satisfies CreateInvalidationCommandOutput),
    )
    vi.spyOn(DynamoDBClient.prototype, 'send').mockImplementation(
      vi.fn<VitestLooseMock>().mockResolvedValue({ $metadata: {} } satisfies PutItemCommandOutput),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gives each party their own filings in full and the other side only as the in-app projection', async () => {
    const scene = await createBothRolesScene()
    const claimantExport = await readAccountExport(scene.claimant.id)
    const posterExport = await readAccountExport(scene.poster.id)

    const [filed] = claimantExport.rows('copyright-notices-filed.csv')
    expect(filed).toMatchObject({
      notice_id: scene.noticeId,
      claimant_display_name: scene.claimantPii.legalName,
      claimant_contact: scene.claimantPii.address,
      work_description: scene.claimantPii.work,
      electronic_signature: scene.claimantPii.signature,
      good_faith_belief: 'true',
      accuracy_authority_under_penalty_of_perjury: 'true',
    })
    expect(JSON.parse(filed!.claimant_targets)).toEqual([
      expect.objectContaining({ hostedUseUrl: scene.hostedUseUrl }),
    ])
    const claimantCase = claimantExport.rows('copyright-cases.csv')
    expect(claimantCase).toEqual([expect.objectContaining({ viewer_role: 'claimant' })])
    const claimantTimeline = JSON.parse(claimantCase[0]!.timeline) as Array<{ event_type: string }>
    expect(claimantTimeline.map(event => event.event_type)).toEqual(
      expect.arrayContaining(['counter_notice_received', 'appeal_received']),
    )
    expect(claimantExport.rows('copyright-counter-notices.csv')).toEqual([])
    for (const secret of scene.posterSecrets)
      expect(claimantExport.serialized).not.toContain(secret)
    expect(claimantExport.serialized).not.toContain(scene.poster.id)

    expect(posterExport.rows('copyright-counter-notices.csv')).toEqual([
      expect.objectContaining({
        submission_id: scene.counterNoticeId,
        notice_id: scene.noticeId,
        name: scene.posterPii.legalName,
        address: scene.posterPii.address,
        telephone: scene.posterPii.telephone,
        consent_to_federal_jurisdiction: 'true',
        consent_to_service_of_process: 'true',
        good_faith_misidentification_under_penalty_of_perjury: 'true',
        electronic_signature: scene.posterPii.signature,
        target_ids: JSON.stringify([scene.targetId]),
      }),
    ])
    expect(posterExport.rows('copyright-appeals.csv')).toEqual([
      expect.objectContaining({
        notice_id: scene.noticeId,
        reason: scene.posterPii.appealReason,
        target_ids: JSON.stringify([scene.targetId]),
      }),
    ])
    expect(posterExport.rows('copyright-cases.csv')).toEqual([
      expect.objectContaining({
        notice_id: scene.noticeId,
        viewer_role: 'poster',
        claimant_user_id: scene.claimant.id,
        claimant_display_name: scene.claimant.username,
      }),
    ])
    expect(posterExport.rows('copyright-notices-filed.csv')).toEqual([])
    for (const secret of scene.claimantSecrets)
      expect(posterExport.serialized).not.toContain(secret)
  }, 60_000)

  it('exports the same case view the participant read model shows, and no staff-only events', async () => {
    const scene = await createBothRolesScene()
    const detail = await getCopyrightPublicNoticeDetail(scene.noticeId, 'member')
    if (!detail) throw new Error('accepted notice should have a member projection')
    const aggregate = await getCopyrightNoticePrivateAggregate(scene.noticeId)
    expect(aggregate?.lifecycleEvents.length).toBeGreaterThan(detail.timeline.length)

    for (const user of [scene.claimant, scene.poster]) {
      const [row] = (await readAccountExport(user.id)).rows('copyright-cases.csv')
      expect(row).toMatchObject({
        notice_id: detail.id,
        jurisdiction: detail.jurisdiction,
        received_at: String(detail.received_at.getTime()),
        accepted_at: String(detail.accepted_at.getTime()),
        provisional_withholding_at: String(detail.provisional_withholding_at?.getTime() ?? ''),
        target_count: String(detail.target_count),
        claimant_user_id: detail.claimant?.user_id,
        claimant_display_name: detail.claimant?.display_name,
      })
      expect(JSON.parse(row!.targets)).toEqual(JSON.parse(JSON.stringify(detail.targets)))
      const timeline = JSON.parse(row!.timeline) as Array<{ created_at: string }>
      expect(
        timeline.map(event => ({ ...event, created_at: Date.parse(event.created_at) })),
      ).toEqual(
        detail.timeline.map(event => ({
          id: event.id,
          event_type: event.event_type,
          created_at: event.created_at.getTime(),
        })),
      )
    }
  }, 60_000)

  it('keeps the exported member event allowlist equal to the participant read model', () => {
    expect(COPYRIGHT_CASE_TIMELINE_EVENT_TYPES.toSorted()).toEqual(
      copyrightTimelineEventTypesFor('member')?.toSorted(),
    )
  })

  it('lists a repeat-infringer incident for the poster without any claimant identity', async () => {
    const scene = await createBothRolesScene()
    const incidents = (await readAccountExport(scene.poster.id)).rows(
      'copyright-repeat-infringer-incidents.csv',
    )

    expect(incidents).toEqual([
      expect.objectContaining({ notice_id: scene.noticeId, operative: 'true', disposition: '' }),
    ])
    expect(Object.keys(incidents[0]!)).toEqual([
      'incident_id',
      'notice_id',
      'operative',
      'created_at',
      'disposition',
      'disposition_recorded_at',
    ])
    expect(JSON.stringify(incidents)).not.toContain(scene.claimant.id)
    expect((await readAccountExport(scene.claimant.id)).rows(COPYRIGHT_FILES[4]!)).toEqual([])
  }, 60_000)

  it('has no copyright records for an erased account, and the other side loses the attribution', async () => {
    const scene = await createBothRolesScene()
    // An operative repeat-infringer incident blocks erasing the poster, so only the claimant erases.
    await hardDeleteTestUser(scene.claimant.id)

    const erased = await readAccountExport(scene.claimant.id)
    for (const file of COPYRIGHT_FILES) expect(erased.rows(file)).toEqual([])
    for (const secret of scene.claimantSecrets) expect(erased.serialized).not.toContain(secret)

    const posterExport = await readAccountExport(scene.poster.id)
    expect(posterExport.rows('copyright-cases.csv')).toEqual([
      expect.objectContaining({ viewer_role: 'poster', claimant_user_id: '' }),
    ])
    expect(posterExport.serialized).not.toContain(scene.claimant.id)
  }, 60_000)
})

async function createBothRolesScene() {
  const fixture = await createCopyrightFormFixture()
  const tag = crypto.randomUUID()
  const claimantPii = {
    legalName: `Claimant Legal Name ${tag}`,
    address: `${tag} Claimant Boulevard, Claimant City`,
    email: `claimant-${tag}@legal.example.test`,
    signature: `/s/ Claimant Signature ${tag}`,
    work: `Claimant work description ${tag}`,
  }
  const posterPii = {
    legalName: `Poster Legal Name ${tag}`,
    address: `${tag} Poster Avenue, Poster Town`,
    telephone: `+1-555-${tag.slice(0, 8)}`,
    signature: `/s/ Poster Signature ${tag}`,
    appealReason: `Poster appeal reason ${tag}`,
  }
  const hostedUseUrl = fixture.form.targets[0]!.target_url
  const intake = await createCopyrightFormIntake({
    currentUser: fixture.claimant,
    requesterIdentity: `user:${fixture.claimant.id}`,
    idempotencyKey: crypto.randomUUID(),
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: claimantPii.legalName,
      claimantContact: claimantPii.address,
      claimantEmail: claimantPii.email,
      workDescription: claimantPii.work,
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: claimantPii.signature,
      claimantTargets: fixture.form.targets.map(target => ({
        surfaceKind: 'post-image' as const,
        postId: target.post_id,
        imageId: target.image_id,
        hostedUseUrl: target.target_url,
      })),
    },
  })
  const noticeId = intake.intake.copyright_notice_id
  const moderator = await createTestUser({ extraRoles: ['moderator'] })
  await reviewCopyrightFormIntake({
    intakeId: intake.intake.id,
    currentUser: moderator,
    accepted: true,
    rationale: 'Internal moderator rationale that no participant may read.',
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const targetId = aggregate!.targets[0]!.id
  const counterNotice = await createCopyrightCounterNotice(
    fixture.poster,
    noticeId,
    crypto.randomUUID(),
    {
      name: posterPii.legalName,
      address: posterPii.address,
      telephone: posterPii.telephone,
      consentToFederalJurisdiction: true,
      consentToServiceOfProcess: true,
      goodFaithMisidentificationUnderPenaltyOfPerjury: true,
      electronicSignature: posterPii.signature,
      targetIds: [targetId],
    },
  )
  await createCopyrightAppeal(fixture.poster, noticeId, crypto.randomUUID(), {
    reason: posterPii.appealReason,
    targetIds: [targetId],
  })
  return {
    claimant: fixture.claimant,
    poster: fixture.poster,
    noticeId,
    targetId,
    hostedUseUrl,
    counterNoticeId: counterNotice.submission.id,
    claimantPii,
    posterPii,
    claimantSecrets: Object.values(claimantPii),
    posterSecrets: Object.values(posterPii),
  }
}
