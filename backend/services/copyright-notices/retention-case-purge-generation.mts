import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import { COPYRIGHT_CASE_PURGE_PHASES } from './retention-case-purge-order.mts'

// Canonical 0740 producers and the blocker-generation row itself write GEN on child deletion.
const generationProducers = new Set([
  'copyright_notices',
  'copyright_notice_targets',
  'copyright_notice_form_intakes',
  'copyright_territorial_notice_receipts',
  'copyright_territorial_decisions',
  'copyright_restrictions',
  'copyright_notice_submissions',
  'copyright_notice_submission_assessments',
  'copyright_notice_legal_hold_assessments',
  'copyright_notice_legal_hold_resolutions',
  'copyright_notice_action_work_items',
  'copyright_notice_deadlines',
  'copyright_notice_email_intake_notice_links',
  'copyright_repeat_infringer_incidents',
  'copyright_notice_delivery_work_items',
  'copyright_notice_guest_capabilities',
  'copyright_notice_email_correspondence_reviews',
  'copyright_notice_target_images',
  'copyright_notice_form_screenings',
  'copyright_notice_form_screening_attempts',
  'copyright_notice_form_intake_reviews',
  'copyright_territorial_redress_decisions',
  'copyright_notice_appeal_reviews',
  'copyright_notice_counter_notice_reviews',
  'copyright_staydown_entries',
  'copyright_staydown_matches',
  'copyright_notice_email_intake_reviews',
  'copyright_notice_delivery_recipients',
  'copyright_notice_thread_blocker_generations',
])

/** Verification-only and nonproducer pages do not acquire the case generation row. */
export function copyrightCasePurgeWritesGeneration(data: CopyrightCasePurgeJobData): boolean {
  if (data.phase === 'final' || data.phase === 'verify_parties') return true
  if (data.phase === 'evidence') return data.phaseIndex > 1
  if (data.phase === 'pointers') return data.phaseIndex === 0 || data.phaseIndex === 1
  if (data.phase !== 'children') return false
  const table = COPYRIGHT_CASE_PURGE_PHASES[data.phaseIndex]?.[0]
  return table !== undefined && generationProducers.has(table)
}
