import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'
import { CONFLICT } from '@modules/on-error/error-codes'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import { beginTransaction } from '@data-stores/psql'
import {
  advanceCopyrightLastLegalActivityAt,
  lockCopyrightNoticeForLegalWrite,
} from './last-legal-activity.mts'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { syncCopyrightRepeatInfringerIncidents } from './repeat-infringer-incidents.mts'

export type CopyrightRepeatInfringerDisposition = 'withdrawn' | 'duplicate' | 'abusive'

export async function recordCopyrightRepeatInfringerDisposition(input: {
  currentUser: PrivateUser
  incidentId: string
  disposition: CopyrightRepeatInfringerDisposition
  rationale: string
  recordedAt: Date
}): Promise<void> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assert(input.rationale.trim() && input.rationale.length <= 10_000, 422, 'rationale is required')
  return conflictOnSerializationFailure(
    async () => {
      await using transaction = await beginTransaction({ serializable: true })
      const { rows: identities } = await transaction<{ copyright_notice_id: string }>(sql`
      /* recordCopyrightRepeatInfringerDisposition:identity */
      SELECT copyright_notice_id FROM copyright_repeat_infringer_incidents
      WHERE id = ${input.incidentId}
    `)
      const noticeId = identities[0]?.copyright_notice_id
      assert(noticeId, 404, 'Copyright repeat-infringer incident not found')
      const lockedNotice = await lockCopyrightNoticeForLegalWrite(transaction, noticeId)
      assert(lockedNotice, 404, 'Copyright repeat-infringer incident not found')
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
      await Promise.all([
        advanceCopyrightLastLegalActivityAt(transaction, lockedNotice),
        readCopyrightThreadRetirement(transaction, [incident.copyright_notice_id]),
      ])
      await transaction.commit()
    },
    'Conflicting copyright case change',
    CONFLICT,
  )
}
