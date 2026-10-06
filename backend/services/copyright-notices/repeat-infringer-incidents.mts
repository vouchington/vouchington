import { beginTransaction, read, type OwnedTransaction } from '@data-stores/psql'
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
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'

export type CopyrightRepeatInfringerDisposition = 'withdrawn' | 'duplicate' | 'abusive'

export type CopyrightRepeatInfringerAccount = {
  incidents: Array<{ id: string; copyright_notice_id: string; is_operative: boolean }>
  open_review_id: string | null
}

export async function syncCopyrightRepeatInfringerIncidents(
  noticeId: string,
  transaction: OwnedTransaction,
): Promise<void> {
  const accountIds = await lockCopyrightRepeatInfringerNoticeAccounts(noticeId, transaction)
  await transaction(
    sql`
    /* syncCopyrightRepeatInfringerIncidents */
    WITH owners AS (
      SELECT DISTINCT party.user_id AS account_user_id
      FROM copyright_notice_targets target
      JOIN copyright_restrictions restriction
        ON restriction.copyright_notice_target_id = target.id
      CROSS JOIN LATERAL `
      .append(copyrightPlacementPartiesSql('strike'))
      .append(sql` party
      WHERE target.copyright_notice_id = ${noticeId}
        AND (
          restriction.human_review_action = 'confirm'
          OR EXISTS (
            SELECT 1 FROM copyright_notice_appeal_reviews review
            WHERE review.copyright_restriction_id = restriction.id AND review.action = 'confirm'
          )
        )
        AND NOT `)
      .append(anyReversalSourceSql)
      .append(sql`
        AND NOT `)
      .append(statutoryRestorationSourceSql).append(sql`
    ), desired AS (
      SELECT owners.account_user_id,
        NOT EXISTS (
          SELECT 1 FROM copyright_repeat_infringer_dispositions disposition
          JOIN copyright_repeat_infringer_incidents incident
            ON incident.id = disposition.copyright_repeat_infringer_incident_id
          WHERE incident.copyright_notice_id = ${noticeId}
            AND incident.account_user_id = owners.account_user_id
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
  `),
  )
  if (accountIds.length === 0) return
  await transaction(sql`
    /* syncCopyrightRepeatInfringerIncidents:openReview */
    INSERT INTO copyright_repeat_infringer_reviews (account_user_id, opened_at)
    SELECT incident.account_user_id, CURRENT_TIMESTAMP
    FROM copyright_repeat_infringer_incidents incident
    JOIN UNNEST(${accountIds}::uuid[]) AS account(id)
      ON incident.account_user_id = account.id
    WHERE incident.is_operative
    GROUP BY incident.account_user_id
    HAVING count(*) >= 2
    ON CONFLICT (account_user_id) WHERE outcome IS NULL DO NOTHING
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
  await lockCopyrightRepeatInfringerNoticeAccounts(identity.copyright_notice_id, transaction)
  const { rows } = await transaction<{ copyright_notice_id: string }>(sql`
    /* recordCopyrightRepeatInfringerDisposition */
    SELECT copyright_notice_id FROM copyright_repeat_infringer_incidents
    WHERE id = ${input.incidentId}
    FOR UPDATE
  `)
  const incident = rows[0]
  assert(incident, 404, 'Copyright repeat-infringer incident not found')
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
    ON CONFLICT (copyright_repeat_infringer_incident_id) DO NOTHING
    RETURNING id
  `)
  assert(inserted[0], 409, 'Copyright repeat-infringer incident already has a disposition')
  await syncCopyrightRepeatInfringerIncidents(incident.copyright_notice_id, transaction)
  await transaction.commit()
}

export async function getCopyrightRepeatInfringerAccount(
  accountUserId: string,
): Promise<CopyrightRepeatInfringerAccount> {
  const { rows: incidents } = await read<{
    id: string
    copyright_notice_id: string
    is_operative: boolean
  }>(sql`
    /* getCopyrightRepeatInfringerAccount:incidents */
    SELECT id, copyright_notice_id, is_operative
    FROM copyright_repeat_infringer_incidents
    WHERE account_user_id = ${accountUserId}
    ORDER BY copyright_notice_id
  `)
  const { rows: reviews } = await read<{ id: string }>(sql`
    /* getCopyrightRepeatInfringerAccount:openReview */
    SELECT id FROM copyright_repeat_infringer_reviews
    WHERE account_user_id = ${accountUserId} AND outcome IS NULL
  `)
  return {
    incidents,
    open_review_id: reviews[0]?.id ?? null,
  }
}
