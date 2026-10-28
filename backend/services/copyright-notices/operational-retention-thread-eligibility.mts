import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'

/** Case-local indexed age probes; paged legal and business proofs run before this statement. */
export function copyrightOperationalThreadEligibleSql(cutoff: Date, noticeId: string) {
  return sql`/* recheckCopyrightThreadCaseEligibility */
    SELECT notice.id FROM copyright_notices notice
    WHERE notice.id = ${noticeId}
      AND notice.id < ${getMinUUIDv7ForDate(new Date(cutoff.getTime() + 1))}::uuid
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_lifecycle_changes event
        WHERE event.copyright_notice_id = notice.id
          AND event.id >= ${getMinUUIDv7ForDate(new Date(cutoff.getTime() + 1))}::uuid)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_delivery_work_items intent
        WHERE intent.copyright_notice_id = notice.id AND intent.updated_at > ${cutoff})
      AND NOT EXISTS (SELECT 1 FROM copyright_repeat_infringer_incidents incident
        WHERE incident.copyright_notice_id = notice.id AND incident.updated_at > ${cutoff})
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_guest_capabilities capability
        WHERE capability.copyright_notice_id = notice.id AND capability.updated_at > ${cutoff})
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_guest_capabilities capability
        WHERE capability.copyright_notice_id = notice.id
          AND capability.revoked_at IS NULL AND capability.expires_at > ${cutoff})
      AND EXISTS (SELECT 1 FROM copyright_notice_thread_retention_activity activity
        WHERE activity.copyright_notice_id = notice.id
          AND activity.last_activity_at <= ${cutoff})`
}
