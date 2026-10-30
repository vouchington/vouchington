import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUserDirect } from './entities/index.mts'
import {
  readTestRepeatInfringerIncidents,
  readTestRepeatInfringerOpenReviewIds,
} from './copyright-repeat-infringer.mts'
import { createTestRepeatInfringerRestriction } from './services/copyright-notices/repeat-infringer.mts'
import { liftTestCopyrightRestriction } from './data-stores/psql/copyright-form-reviews.mts'
import { sendAllCopyrightDeliveries } from './services/copyright-notices/retention-deliveries.mts'
import { recordCopyrightRepeatInfringerReviewOutcome } from '../services/copyright-notices/repeat-infringer-outcomes.mts'
import { recordCopyrightRepeatInfringerDisposition } from '../services/copyright-notices/repeat-infringer-incidents.mts'
import { unsuspendUser } from '../services/users/suspension.mts'
import { eraseCopyrightRetentionCase } from '../services/copyright-notices/retention-erasure-case.mts'
import { purgeCopyrightMinimalRecordPage } from '../services/copyright-notices/retention-minimal-purge-case.mts'

const MAX_WORK_PAGES = 128

/** Two confirmed cases establish a real suspension and its exact incident FK provenance. */
export async function createCopyrightPostrootSuspensionFixture() {
  const [poster, moderator, administrator] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect({ extraRoles: ['moderator'] }),
    createTestUserDirect({ administrator: true }),
  ])
  const first = await createTestRepeatInfringerRestriction(poster.id, moderator)
  const second = await createTestRepeatInfringerRestriction(poster.id, moderator)
  const [reviewId] = await readTestRepeatInfringerOpenReviewIds(poster.id)
  if (!reviewId) throw new Error('Copyright suspension fixture has no open review')
  await recordCopyrightRepeatInfringerReviewOutcome({
    currentUser: administrator,
    reviewId,
    outcome: 'restrict',
    rationale: `Two confirmed source cases ${crypto.randomUUID()}`,
    recordedAt: new Date(),
  })
  await unsuspendUser(administrator, poster.id)
  return { poster, moderator, reviewId, first, second }
}

export async function closeCopyrightPostrootSource(
  fixture: Awaited<ReturnType<typeof createCopyrightPostrootSuspensionFixture>>,
  source: { noticeId: string; restrictionId: string },
): Promise<void> {
  const incident = (await readTestRepeatInfringerIncidents(fixture.poster.id)).find(
    row => row.copyright_notice_id === source.noticeId,
  )
  if (!incident) throw new Error('Copyright suspension fixture source is missing')
  await recordCopyrightRepeatInfringerDisposition({
    currentUser: fixture.moderator,
    incidentId: incident.id,
    disposition: 'duplicate',
    rationale: `Source case closed ${crypto.randomUUID()}`,
    recordedAt: new Date(),
  })
  await liftTestCopyrightRestriction(source.restrictionId)
  await sendAllCopyrightDeliveries(source.noticeId)
}

export type CopyrightRetentionCaseRows = {
  notice_exists: boolean
  identity_exists: boolean
  work_exists: boolean
  root_purged_at: Date | null
  party_count: number
  promoted_review_count: number
}

/** Read the notice's actual issuance fact, independently of the retention eligibility projection. */
export async function readCopyrightRetentionCaseCreatedAt(noticeId: string): Promise<Date> {
  const { rows } = await read<{ created_at: Date }>(sql`
    /* readCopyrightRetentionCaseCreatedAt */
    SELECT created_at FROM copyright_notices WHERE id = ${noticeId}`)
  if (!rows[0]) throw new Error('Copyright retention fixture notice is missing')
  return rows[0].created_at
}

/** Only the case's own retained identities, review edge, and continuation are inspected. */
export async function readCopyrightRetentionCaseRows(
  noticeId: string,
): Promise<CopyrightRetentionCaseRows> {
  const { rows } = await read<CopyrightRetentionCaseRows>(sql`
    /* readCopyrightRetentionCaseRows */
    SELECT EXISTS (SELECT 1 FROM copyright_notices WHERE id = ${noticeId}) AS notice_exists,
      EXISTS (SELECT 1 FROM copyright_notice_retained_identities WHERE id = ${noticeId}) AS identity_exists,
      EXISTS (SELECT 1 FROM copyright_notice_minimal_purge_continuations
        WHERE copyright_notice_identity_id = ${noticeId}) AS work_exists,
      (SELECT root_purged_at FROM copyright_notice_minimal_purge_continuations
        WHERE copyright_notice_identity_id = ${noticeId}) AS root_purged_at,
      (SELECT count(*)::integer FROM copyright_notice_retained_parties
        WHERE copyright_notice_identity_id = ${noticeId}) AS party_count,
      (SELECT count(*)::integer FROM copyright_notice_email_intake_reviews
        WHERE promoted_copyright_notice_identity_id = ${noticeId}) AS promoted_review_count`)
  if (!rows[0]) throw new Error('Copyright case retention snapshot is missing')
  return rows[0]
}

/** Advance finite production work; stop at the committed root-removal boundary, before party GC. */
export async function advanceCopyrightRetentionToPostroot(
  noticeId: string,
  options: { now: Date; cutoff: Date },
): Promise<CopyrightRetentionCaseRows> {
  let erased = false
  for (let page = 0; page < MAX_WORK_PAGES; page++) {
    const outcome = await eraseCopyrightRetentionCase(noticeId, options.now)
    if (outcome === 'ineligible') throw new Error('Copyright source case is still ineligible')
    if (outcome === 'erased') {
      erased = true
      break
    }
  }
  if (!erased) throw new Error('Copyright erasure fixture exceeded its work page budget')
  for (let page = 0; page < MAX_WORK_PAGES; page++) {
    const outcome = await purgeCopyrightMinimalRecordPage(noticeId, {
      ...options,
      pageSize: 50,
      remainingPhysicalRows: 100,
    })
    if (outcome.outcome !== 'progress')
      throw new Error(`Copyright root fixture stopped at ${outcome.outcome}`)
    const state = await readCopyrightRetentionCaseRows(noticeId)
    if (state.root_purged_at && !state.notice_exists) return state
  }
  throw new Error('Copyright root fixture exceeded its work page budget')
}

export type CopyrightSuspensionRetentionRows = {
  reliance_exists: boolean
  released_at: Date | null
  source_count: number
  operative_source_count: number
  review_exists: boolean
  suspension_history_count: number
  last_released_at: Date | null
}

/** Review/history and the compact retained release clock survive authority-row collection. */
export async function readCopyrightSuspensionRetentionRows(
  accountId: string,
  reviewId: string,
): Promise<CopyrightSuspensionRetentionRows> {
  const { rows } = await read<CopyrightSuspensionRetentionRows>(sql`
    /* readCopyrightSuspensionRetentionRows */
    SELECT EXISTS (SELECT 1 FROM copyright_account_suspension_reliances
        WHERE account_user_id = ${accountId}) AS reliance_exists,
      (SELECT released_at FROM copyright_account_suspension_reliances
        WHERE account_user_id = ${accountId}) AS released_at,
      (SELECT count(*)::integer FROM copyright_account_suspension_incidents
        WHERE account_user_id = ${accountId}) AS source_count,
      (SELECT count(*)::integer FROM copyright_account_suspension_incidents source
        JOIN copyright_repeat_infringer_incidents incident
          ON incident.id = source.copyright_repeat_infringer_incident_id
        WHERE source.account_user_id = ${accountId} AND incident.is_operative) AS operative_source_count,
      EXISTS (SELECT 1 FROM copyright_repeat_infringer_reviews
        WHERE id = ${reviewId} AND account_user_id = ${accountId}) AS review_exists,
      (SELECT count(*)::integer FROM user_suspensions
        WHERE user_id = ${accountId}) AS suspension_history_count,
      (SELECT last_copyright_suspension_released_at FROM retained_user_identities
        WHERE id = ${accountId}) AS last_released_at`)
  if (!rows[0]) throw new Error('Copyright suspension retention snapshot is missing')
  return rows[0]
}
