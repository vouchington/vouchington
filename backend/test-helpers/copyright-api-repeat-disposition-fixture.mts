import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { syncCopyrightRepeatInfringerIncidents } from '../services/copyright-notices/repeat-infringer-incidents.mts'
import {
  lockCopyrightNoticeForLegalWrite,
  advanceCopyrightLastLegalActivityAt,
} from '../services/copyright-notices/last-legal-activity.mts'

/** Complete committed voided incident for an independent unconditional staff account-list assertion. */
export async function seedApiRepeatDisposition(input: {
  noticeId: string
  incidentId: string
  actorId: string
  rationale: string
}) {
  await using transaction = await beginTransaction()
  const notice = await lockCopyrightNoticeForLegalWrite(transaction, input.noticeId)
  if (!notice) throw new Error('Owned disposition case missing')
  const at = new Date()
  const { rowCount } =
    await transaction(sql`/* seedApiRepeatDisposition:current */ UPDATE copyright_repeat_infringer_incidents
    SET is_operative = false,current_disposition = 'abusive',current_disposition_recorded_at = ${at},current_disposition_recorded_by_id = ${input.actorId}
    WHERE id = ${input.incidentId} AND copyright_notice_id = ${input.noticeId} AND current_disposition IS NULL`)
  if (rowCount !== 1) throw new Error('Owned disposition incident was not undecided')
  await transaction(sql`/* seedApiRepeatDisposition:history */ INSERT INTO copyright_repeat_infringer_dispositions
    (copyright_repeat_infringer_incident_id,disposition,rationale_ciphertext,recorded_at,recorded_by_id)
    VALUES (${input.incidentId},'abusive',${encryptSecret(input.rationale, `copyright-repeat-infringer-disposition:${input.incidentId}`)},${at},${input.actorId})`)
  await syncCopyrightRepeatInfringerIncidents(input.noticeId, transaction)
  await advanceCopyrightLastLegalActivityAt(transaction, notice)
  await transaction.commit()
}
