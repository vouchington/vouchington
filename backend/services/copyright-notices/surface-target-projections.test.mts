import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getTestPrivateUserById,
  softDeleteUser,
} from '@voucha/test-helpers/entities/users'
import { insertTestCommunityMember } from '@voucha/test-helpers/entities/community-members'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { reactivateTestCommunityImageWithoutBinder } from '@voucha/test-helpers/copyright-administrator-lift-fixtures'
import { readTestCopyrightStaffTargetProjection } from '@voucha/test-helpers/copyright-staff-target-projection'
import { readAccountExport } from '@voucha/test-helpers/services/copyright-notices/read-account-export'
import {
  getCopyrightParticipantNoticeDetail,
  getCopyrightPublicNoticeDetail,
} from './read-models.mts'

function caseRows(rows: Record<string, string>[], noticeId: string) {
  return rows.filter(row => row.notice_id === noticeId)
}

describe('surface target projections and respondent exports', () => {
  it('shows captured activation provenance only in staff targets, while member views omit it', async () => {
    const fixture = await createTestCopyrightImageFixture('community-profile-image')
    const { noticeId, targetId } = await createTestCopyrightRestrictionForImage(fixture)
    const staff = await readTestCopyrightStaffTargetProjection(noticeId)
    expect(staff).toEqual([
      expect.objectContaining({
        id: targetId,
        surface: 'community-profile-image',
        provenance: {
          set_by_id: fixture.actorUserId,
          set_by_administrator: false,
          uploaded_by_id: fixture.actorUserId,
        },
      }),
    ])
    const publicDetail = await getCopyrightPublicNoticeDetail(noticeId)
    expect(publicDetail?.targets).toEqual([
      expect.objectContaining({ id: targetId, surface: 'community-profile-image' }),
    ])
    expect(publicDetail?.targets[0]).not.toHaveProperty('provenance')
    const setter = await getTestPrivateUserById(fixture.actorUserId)
    if (!setter) throw new Error('Community setter fixture missing')
    const participant = await getCopyrightParticipantNoticeDetail(noticeId, setter)
    expect(participant).toMatchObject({ viewer_role: 'poster', respondable_target_ids: [targetId] })
    expect(participant?.targets[0]).not.toHaveProperty('provenance')
    const otherFixture = await createTestCopyrightImageFixture('user-profile-image')
    const ownRestriction = await createTestCopyrightRestrictionForImage(otherFixture)
    const respondent = await readTestCopyrightStaffTargetProjection(ownRestriction.noticeId)
    expect(respondent[0]?.provenance).toMatchObject({ set_by_administrator: null })
  })

  it('uses null provenance for an unknown binder and excludes informational owners from case export', async () => {
    const fixture = await createTestCopyrightImageFixture('community-banner-image')
    await reactivateTestCommunityImageWithoutBinder(fixture)
    const owner = await createTestUserDirect({ withEmail: true })
    await insertTestCommunityMember({
      communityId: fixture.ownerId,
      userId: owner.id,
      role: 'owner',
    })
    const { noticeId, targetId } = await createTestCopyrightRestrictionForImage(fixture)
    expect(await readTestCopyrightStaffTargetProjection(noticeId)).toEqual([
      expect.objectContaining({ id: targetId, provenance: null }),
    ])
    expect(
      caseRows((await readAccountExport(owner.id)).rows('copyright-cases.csv'), noticeId),
    ).toEqual([])
  })

  it('includes a live surface respondent in copyright-cases.csv and excludes the deleted account', async () => {
    const fixture = await createTestCopyrightImageFixture('user-profile-image')
    const { noticeId, targetId } = await createTestCopyrightRestrictionForImage(fixture)
    const before = caseRows(
      (await readAccountExport(fixture.actorUserId)).rows('copyright-cases.csv'),
      noticeId,
    )
    expect(before).toEqual([
      expect.objectContaining({
        notice_id: noticeId,
        viewer_role: 'poster',
      }),
    ])
    expect(JSON.parse(before[0]!.targets)).toEqual([expect.objectContaining({ id: targetId })])
    await softDeleteUser(fixture.actorUserId)
    expect(
      caseRows(
        (await readAccountExport(fixture.actorUserId)).rows('copyright-cases.csv'),
        noticeId,
      ),
    ).toEqual([])
  })
})
