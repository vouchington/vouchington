import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { readCopyrightApiRetentionState } from './copyright-api-preservation-outcome.mts'

/** Full owned case plus capability identities, token authority, urgent filings and email recipients. */
export async function readApiGuestState(noticeId: string) {
  const [
    state,
    { rows: capabilities },
    { rows: identities },
    { rows: urgent },
    { rows: recipients },
    { rows: activity },
    { rows: deliveryWork },
  ] = await Promise.all([
    readCopyrightApiRetentionState(noticeId),
    write<{
      id: string
      copyright_notice_id: string
      token_hash: string
      issued_by_id: string
      expires_at: Date
      revoked_at: Date | null
    }>(
      sql`/* readApiGuestState:capabilities */ SELECT * FROM copyright_notice_guest_capabilities WHERE copyright_notice_id = ${noticeId} ORDER BY id`,
    ),
    write<{ id: string; copyright_notice_id: string; created_at: Date }>(
      sql`/* readApiGuestState:identities */ SELECT * FROM copyright_notice_guest_capability_identities WHERE copyright_notice_id = ${noticeId} ORDER BY id`,
    ),
    write<{
      submission: string
      at: Date
    }>(sql`/* readApiGuestState:urgent */ SELECT urgent.copyright_notice_submission_id AS submission, urgent.classified_at AS at
      FROM copyright_notice_urgent_filings urgent JOIN copyright_notice_submissions submission ON submission.id = urgent.copyright_notice_submission_id WHERE submission.copyright_notice_id = ${noticeId} ORDER BY submission.id`),
    write<{
      id: string
      email: string
    }>(sql`/* readApiGuestState:recipients */ SELECT recipient.copyright_notice_delivery_work_item_id AS id,recipient.email_ciphertext AS email
      FROM copyright_notice_delivery_recipients recipient JOIN copyright_notice_delivery_work_items work ON work.id = recipient.copyright_notice_delivery_work_item_id WHERE work.copyright_notice_id = ${noticeId} ORDER BY work.id`),
    write<{ guest: Date | null; lifecycle: Date | null }>(
      sql`/* readApiGuestState:activity */ SELECT last_guest_capability_activity_at AS guest,last_lifecycle_activity_at AS lifecycle FROM copyright_notices WHERE id = ${noticeId}`,
    ),
    write<{ id: string }>(
      sql`/* readApiGuestState:deliveryWork */ SELECT * FROM copyright_notice_delivery_work_items WHERE copyright_notice_id = ${noticeId} ORDER BY id`,
    ),
  ])
  if (!activity[0]) throw new Error('Owned guest activity clocks disappeared')
  return {
    ...state,
    capabilities,
    identities,
    urgent,
    recipients,
    deliveryWork,
    activity: activity[0],
  }
}
