import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import {
  advanceCopyrightLastLegalActivityAt,
  lockCopyrightNoticeForLegalWrite,
} from './last-legal-activity.mts'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { lockCopyrightRepeatInfringerNoticeAccounts } from './repeat-infringer-locks.mts'
import {
  anyReversalSourceSql,
  statutoryRestorationSourceSql,
} from './restriction-reversal-sources-sql.mts'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import { recordCopyrightRepeatInfringerTargetProvenance } from './repeat-infringer-target-provenance.mts'

export type CopyrightRepeatInfringerDisposition = 'withdrawn' | 'duplicate' | 'abusive'

export async function syncCopyrightRepeatInfringerIncidents(
  noticeId: string,
  transaction: OwnedTransaction,
): Promise<void> {
  const accountIds = await lockCopyrightRepeatInfringerNoticeAccounts(noticeId, transaction)
  const statement = sql`
    /* syncCopyrightRepeatInfringerIncidents */
    WITH eligible_targets AS (
      SELECT target.*,
        NOT (`
  statement.append(anyReversalSourceSql())
  statement.append(sql`) AND NOT (`)
  statement.append(statutoryRestorationSourceSql())
  statement.append(sql`) AS is_operative_restriction
      FROM copyright_notice_targets target
      JOIN copyright_restrictions restriction
        ON restriction.copyright_notice_target_id = target.id
      WHERE target.copyright_notice_id = ${noticeId}
        AND (
          restriction.human_review_action = 'confirm'
          OR EXISTS (
            SELECT 1 FROM copyright_notice_appeal_reviews review
            WHERE review.copyright_restriction_id = restriction.id AND review.action = 'confirm'
          )
        )
    ), current_target_owners AS (
      SELECT DISTINCT target.id AS copyright_notice_target_id,
        party.user_id AS account_user_id
      FROM eligible_targets target
      CROSS JOIN LATERAL `)
  statement.append(copyrightPlacementPartiesSql('strike'))
  statement.append(sql` party
    ), owners AS (
      SELECT DISTINCT owner.account_user_id
      FROM current_target_owners owner
      JOIN eligible_targets target ON target.id = owner.copyright_notice_target_id
      WHERE target.is_operative_restriction
      UNION
      SELECT incident.account_user_id
      FROM copyright_repeat_infringer_incident_targets provenance
      JOIN copyright_repeat_infringer_incidents incident
        ON incident.id = provenance.copyright_repeat_infringer_incident_id
        AND incident.copyright_notice_id = provenance.copyright_notice_id
      JOIN eligible_targets target
        ON target.id = provenance.copyright_notice_target_id
        AND target.is_operative_restriction
      WHERE provenance.copyright_notice_id = ${noticeId}
    ), desired AS (
      SELECT owners.account_user_id,
        NOT EXISTS (
          SELECT 1 FROM copyright_repeat_infringer_incidents incident
          WHERE incident.copyright_notice_id = ${noticeId}
            AND incident.account_user_id = owners.account_user_id
            AND incident.current_disposition IS NOT NULL
        ) AS is_operative
      FROM owners
    ), upserted AS (
      INSERT INTO copyright_repeat_infringer_incidents (
        account_user_id, copyright_notice_id, is_operative
      )
      SELECT account_user_id, ${noticeId}, is_operative FROM desired
      ON CONFLICT (account_user_id, copyright_notice_id) DO UPDATE
      SET is_operative = EXCLUDED.is_operative
      WHERE copyright_repeat_infringer_incidents.is_operative IS DISTINCT FROM EXCLUDED.is_operative
      RETURNING account_user_id, is_operative
    ), cleared AS (
      UPDATE copyright_repeat_infringer_incidents incident
      SET is_operative = false
      WHERE incident.copyright_notice_id = ${noticeId}
        AND incident.is_operative
        AND NOT EXISTS (
          SELECT 1 FROM desired WHERE desired.account_user_id = incident.account_user_id
        )
      RETURNING incident.account_user_id
    )
    SELECT account_user_id, is_operative FROM upserted
    UNION ALL
    SELECT account_user_id, false FROM cleared
  `)
  await transaction(statement)
  await recordCopyrightRepeatInfringerTargetProvenance(noticeId, transaction)
  if (accountIds.length === 0) return
  await transaction(sql`
    /* syncCopyrightRepeatInfringerIncidents:openReview */
    WITH eligible AS (
      SELECT incident.account_user_id
      FROM copyright_repeat_infringer_incidents incident
      JOIN users live_account
        ON live_account.id = incident.account_user_id AND live_account.deleted_at IS NULL
      JOIN UNNEST(${accountIds}::uuid[]) AS candidate(id)
        ON incident.account_user_id = candidate.id
      LEFT JOIN copyright_repeat_infringer_account_states account_state
        ON account_state.account_user_id = incident.account_user_id
      WHERE incident.is_operative AND account_state.current_open_review_identity_id IS NULL
      GROUP BY incident.account_user_id
      HAVING count(*) >= 2
    ), identities AS (
      INSERT INTO copyright_repeat_infringer_review_identities (account_user_id)
      SELECT account_user_id FROM eligible
      RETURNING id, account_user_id
    ), opened AS (
      INSERT INTO copyright_repeat_infringer_account_states (
        account_user_id, current_open_review_identity_id
      ) SELECT account_user_id, id FROM identities
      ON CONFLICT (account_user_id) DO UPDATE
      SET current_open_review_identity_id = EXCLUDED.current_open_review_identity_id
      WHERE copyright_repeat_infringer_account_states.current_open_review_identity_id IS NULL
      RETURNING account_user_id, current_open_review_identity_id
    ) SELECT count(*) FROM opened
  `)
}

export async function recordCopyrightRepeatInfringerDisposition(input: {
  currentUser: PrivateUser
  incidentId: string
  disposition: CopyrightRepeatInfringerDisposition
  rationale: string
  recordedAt: Date
}): Promise<void> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(input.rationale.trim() && input.rationale.length <= 10_000, 422, 'rationale is required')
  await using transaction = await beginTransaction()
  const { rows: identities } = await transaction<{ copyright_notice_id: string }>(sql`
    /* recordCopyrightRepeatInfringerDisposition:identity */
    SELECT copyright_notice_id FROM copyright_repeat_infringer_incidents
    WHERE id = ${input.incidentId}
  `)
  const identity = identities[0]
  assert(identity, 404, 'Copyright repeat-infringer incident not found')
  const lockedNotice = await lockCopyrightNoticeForLegalWrite(
    transaction,
    identity.copyright_notice_id,
  )
  assert(lockedNotice, 404, 'Copyright repeat-infringer incident not found')
  await lockCopyrightRepeatInfringerNoticeAccounts(identity.copyright_notice_id, transaction)
  const { rows } = await transaction<{
    copyright_notice_id: string
    current_disposition: CopyrightRepeatInfringerDisposition | null
  }>(sql`
    /* recordCopyrightRepeatInfringerDisposition */
    SELECT copyright_notice_id, current_disposition FROM copyright_repeat_infringer_incidents
    WHERE id = ${input.incidentId}
    FOR UPDATE
  `)
  const incident = rows[0]
  assert(incident, 404, 'Copyright repeat-infringer incident not found')
  assert(
    !incident.current_disposition,
    409,
    'Copyright repeat-infringer incident already has a disposition',
  )
  await transaction(sql`
    /* recordCopyrightRepeatInfringerDisposition:current */
    UPDATE copyright_repeat_infringer_incidents
    SET is_operative = false,
      current_disposition = ${input.disposition},
      current_disposition_recorded_at = ${input.recordedAt},
      current_disposition_recorded_by_id = ${input.currentUser.id}
    WHERE id = ${input.incidentId}
  `)
  const { rows: inserted } = await transaction<{ id: string }>(sql`
    /* recordCopyrightRepeatInfringerDisposition:insert */
    INSERT INTO copyright_repeat_infringer_dispositions (
      copyright_repeat_infringer_incident_id, disposition, rationale_ciphertext, recorded_at,
      recorded_by_id
    ) VALUES (
      ${input.incidentId}, ${input.disposition},
      ${encryptSecret(input.rationale, `copyright-repeat-infringer-disposition:${input.incidentId}`)},
      ${input.recordedAt}, ${input.currentUser.id}
    )
    RETURNING id
  `)
  assert(inserted[0], 409, 'Copyright repeat-infringer incident already has a disposition')
  await syncCopyrightRepeatInfringerIncidents(incident.copyright_notice_id, transaction)
  await advanceCopyrightLastLegalActivityAt(transaction, lockedNotice)
  await transaction.commit()
}
