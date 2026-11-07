import { beginTransaction, read } from '@data-stores/psql'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { selectCopyrightParticipantStatements } from './participant-statements.mts'
import { getCopyrightPublicNoticeDetail } from './read-models.mts'
import type { CopyrightParticipantNoticeDetail } from './read-models-notice-types.mts'
import { getEuParticipantNoticeDetail } from './read-models-territorial.mts'

export async function getCopyrightParticipantNoticeDetail(
  noticeId: string,
  currentUser: PrivateUser,
): Promise<CopyrightParticipantNoticeDetail | null> {
  const viewerRole = await getCopyrightNoticeViewerRole(noticeId, currentUser)
  if (!viewerRole) return null
  const { rows: jurisdictions } = await read<{
    jurisdiction: string
  }>(sql`/* getCopyrightParticipantNoticeJurisdiction */
    SELECT jurisdiction FROM copyright_notices WHERE id = ${noticeId}
  `)
  if (jurisdictions[0]?.jurisdiction === 'eu_dsa')
    return getEuParticipantNoticeDetail(
      noticeId,
      currentUser,
      viewerRole,
      await getCopyrightPublicNoticeDetail(noticeId, viewerRole === 'staff' ? 'staff' : 'member'),
    )
  const detail = await getCopyrightPublicNoticeDetail(
    noticeId,
    viewerRole === 'staff' ? 'staff' : 'member',
  )
  if (!detail) return null
  await using transaction = await beginTransaction()
  const respondableTargetsSql = sql`/* getCopyrightParticipantNoticeDetail:respondableTargets */
      SELECT DISTINCT target.id
      FROM copyright_notice_targets target
      CROSS JOIN LATERAL `
  respondableTargetsSql.append(copyrightPlacementPartiesSql('respond'))
  respondableTargetsSql.append(sql` party
      WHERE target.copyright_notice_id = ${noticeId}
        AND party.user_id = ${currentUser.id}
      ORDER BY target.id`)
  const [{ rows: submissions }, { rows: respondableTargets }] = await Promise.all([
    transaction<CopyrightParticipantNoticeDetail['submissions'][number]>(
      sql`/* getCopyrightParticipantNoticeDetail:submissions */
      SELECT id, kind, received_at, source_kind
      FROM copyright_notice_submissions
      WHERE copyright_notice_id = ${noticeId}
        AND (${viewerRole === 'staff'} OR submitted_by_id = ${currentUser.id})
      ORDER BY received_at, id
    `,
    ),
    transaction<{ id: string }>(respondableTargetsSql),
  ])
  const statements = await selectCopyrightParticipantStatements(
    noticeId,
    currentUser.id,
    viewerRole,
    transaction,
  )
  await transaction.commit()
  return {
    ...detail,
    statements,
    viewer_role: viewerRole,
    respondable_target_ids:
      detail.jurisdiction === 'us_dmca' ? respondableTargets.map(target => target.id) : [],
    submissions,
  }
}

export async function getCopyrightNoticeViewerRole(
  noticeId: string,
  currentUser: PrivateUser,
): Promise<'claimant' | 'poster' | 'staff' | null> {
  const canReview = currentUserCanReviewCopyrightNotices(currentUser)
  await using transaction = await beginTransaction()
  const viewerSql = sql`/* getCopyrightNoticeViewerRole */
    SELECT CASE
      WHEN ${canReview} THEN 'staff'
      WHEN notice.claimant_user_id = ${currentUser.id} THEN 'claimant'
      WHEN EXISTS (
        SELECT 1 FROM copyright_notice_targets target
        CROSS JOIN LATERAL `
  viewerSql.append(copyrightPlacementPartiesSql('respond'))
  viewerSql.append(sql` party
        WHERE target.copyright_notice_id = notice.id AND party.user_id = ${currentUser.id}
      ) THEN 'poster'
      ELSE NULL
    END AS role
    FROM copyright_notices notice
    WHERE notice.id = ${noticeId}
  `)
  const { rows } = await transaction<{
    role: 'claimant' | 'poster' | 'staff' | null
  }>(viewerSql)
  await transaction.commit()
  return rows[0]?.role ?? null
}
