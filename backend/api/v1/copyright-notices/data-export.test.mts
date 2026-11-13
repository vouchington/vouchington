import { createExportBothRolesScene as createBothRolesScene } from '@voucha/test-helpers/copyright-export-both-roles-scene'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPYRIGHT_CASE_TIMELINE_EVENT_TYPES } from '@services/account-data-requests/stream-copyright-cases'
import { getCopyrightPublicNoticeDetail } from '@services/copyright-notices/read-models'
import { copyrightTimelineEventTypesFor } from '@services/copyright-notices/timeline-visibility'
import { hardDeleteTestUser } from '@voucha/test-helpers'
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
      has_good_faith_belief: 'true',
      has_accuracy_authority_under_penalty_of_perjury: 'true',
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
  })

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
  })

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
      expect.objectContaining({ notice_id: scene.noticeId, is_operative: 'true', disposition: '' }),
    ])
    expect(Object.keys(incidents[0]!)).toEqual([
      'incident_id',
      'notice_id',
      'is_operative',
      'created_at',
      'disposition',
      'disposition_recorded_at',
    ])
    expect(JSON.stringify(incidents)).not.toContain(scene.claimant.id)
    expect((await readAccountExport(scene.claimant.id)).rows(COPYRIGHT_FILES[4]!)).toEqual([])
  })

  it('has no copyright records for an erased account, and the other side loses the attribution', async () => {
    const scene = await createBothRolesScene()
    // An is_operative repeat-infringer incident blocks erasing the poster, so only the claimant erases.
    await hardDeleteTestUser(scene.claimant.id)

    const erased = await readAccountExport(scene.claimant.id)
    for (const file of COPYRIGHT_FILES) expect(erased.rows(file)).toEqual([])
    for (const secret of scene.claimantSecrets) expect(erased.serialized).not.toContain(secret)

    const posterExport = await readAccountExport(scene.poster.id)
    expect(posterExport.rows('copyright-cases.csv')).toEqual([
      expect.objectContaining({ viewer_role: 'poster', claimant_user_id: '' }),
    ])
    expect(posterExport.serialized).not.toContain(scene.claimant.id)
  })
})
