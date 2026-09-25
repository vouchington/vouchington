import { beginTransaction, read, type OwnedTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

export type CopyrightRepeatInfringerDisposition = 'withdrawn' | 'duplicate' | 'abusive'

export type CopyrightRepeatInfringerAccount = {
  incidents: Array<{ id: string; copyright_notice_id: string; operative: boolean }>
  open_review_id: string | null
}

export async function syncCopyrightRepeatInfringerIncidents(
  noticeId: string,
  transaction: OwnedTransaction,
): Promise<void> {
  const changed = await transaction<{ account_user_id: string; operative: boolean }>(sql`
    /* syncCopyrightRepeatInfringerIncidents */
    WITH owners AS (
      SELECT DISTINCT post.created_by_id AS account_user_id
      FROM copyright_notice_targets target
      JOIN copyright_restrictions restriction
        ON restriction.copyright_notice_target_id = target.id
      JOIN media_placements placement
        ON target.placement_key = concat('image-placement:', placement.id)
      JOIN image_placements image_placement ON image_placement.placement_id = placement.id
      JOIN posts post ON post.id = image_placement.post_id
      WHERE target.copyright_notice_id = ${noticeId}
        AND restriction.human_review_action IN ('confirm', 'modify')
        AND post.created_by_id IS NOT NULL
    ), desired AS (
      SELECT owners.account_user_id,
        NOT EXISTS (
          SELECT 1 FROM copyright_repeat_infringer_dispositions disposition
          JOIN copyright_repeat_infringer_incidents incident
            ON incident.id = disposition.copyright_repeat_infringer_incident_id
          WHERE incident.copyright_notice_id = ${noticeId}
            AND incident.account_user_id = owners.account_user_id
        ) AS operative
      FROM owners
    ), upserted AS (
      INSERT INTO copyright_repeat_infringer_incidents (
        account_user_id, copyright_notice_id, operative
      )
      SELECT account_user_id, ${noticeId}, operative FROM desired
      ON CONFLICT (account_user_id, copyright_notice_id) DO UPDATE
      SET operative = EXCLUDED.operative, updated_at = CURRENT_TIMESTAMP
      WHERE copyright_repeat_infringer_incidents.operative IS DISTINCT FROM EXCLUDED.operative
      RETURNING account_user_id, operative
    ), cleared AS (
      UPDATE copyright_repeat_infringer_incidents incident
      SET operative = false, updated_at = CURRENT_TIMESTAMP
      WHERE incident.copyright_notice_id = ${noticeId}
        AND incident.operative
        AND NOT EXISTS (
          SELECT 1 FROM desired WHERE desired.account_user_id = incident.account_user_id
        )
      RETURNING incident.account_user_id
    )
    SELECT account_user_id, operative FROM upserted
    UNION ALL
    SELECT account_user_id, false FROM cleared
  `)
  const newlyOperative: string[] = []
  for (const row of changed.rows) {
    if (row.operative) newlyOperative.push(row.account_user_id)
  }
  if (newlyOperative.length === 0) return
  await transaction(sql`
    /* syncCopyrightRepeatInfringerIncidents:openReview */
    INSERT INTO copyright_repeat_infringer_reviews (account_user_id, opened_at)
    SELECT incident.account_user_id, CURRENT_TIMESTAMP
    FROM copyright_repeat_infringer_incidents incident
    JOIN jsonb_array_elements_text(${JSON.stringify(newlyOperative)}::jsonb) AS account(id)
      ON incident.account_user_id = account.id::uuid
    WHERE incident.operative
    GROUP BY incident.account_user_id
    HAVING count(*) >= 2
      AND NOT EXISTS (
        SELECT 1 FROM copyright_repeat_infringer_reviews review
        WHERE review.account_user_id = incident.account_user_id AND review.outcome IS NULL
      )
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
  const { rows } = await transaction<{ copyright_notice_id: string }>(sql`
    /* recordCopyrightRepeatInfringerDisposition */
    SELECT copyright_notice_id FROM copyright_repeat_infringer_incidents
    WHERE id = ${input.incidentId}
    FOR UPDATE
  `)
  const incident = rows[0]
  assert(incident, 404, 'Copyright repeat-infringer incident not found')
  const { rows: inserted } = await transaction<{ id: string }>(sql`
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
    operative: boolean
  }>(sql`
    SELECT id, copyright_notice_id, operative
    FROM copyright_repeat_infringer_incidents
    WHERE account_user_id = ${accountUserId}
    ORDER BY copyright_notice_id
  `)
  const { rows: reviews } = await read<{ id: string }>(sql`
    SELECT id FROM copyright_repeat_infringer_reviews
    WHERE account_user_id = ${accountUserId} AND outcome IS NULL
  `)
  return {
    incidents,
    open_review_id: reviews[0]?.id ?? null,
  }
}
