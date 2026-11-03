import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown, read } from '../index.mts'

/**
 * Every table that points at a case must say how its writes reach `last_legal_activity_at`, so a
 * new legal-fact table cannot skip the clock that the purge reads. Services take the notice lock
 * first (`lockCopyrightNoticeForLegalWrite`), then write children, then advance.
 */
const caseTables = {
  // A lifecycle event in the writing transaction advances the clock through its trigger.
  copyright_notice_lifecycle_changes: 'trigger',
  copyright_notice_submissions: 'lifecycle event',
  copyright_notice_deadlines: 'lifecycle event',
  copyright_notice_correspondence_messages: 'lifecycle event',
  copyright_notice_guest_capabilities: 'lifecycle event',
  copyright_notice_guest_capability_identities: 'lifecycle event',
  // The writing service advances the clock after taking the notice lock.
  copyright_repeat_infringer_incidents: 'advance',
  copyright_territorial_decisions: 'advance',
  copyright_territorial_decision_identities: 'advance',
  copyright_territorial_redress_requests: 'advance',
  copyright_eu_supervised_complaints: 'advance',
  copyright_eu_dispute_settlement_referrals: 'advance',
  copyright_territorial_escalations: 'advance',
  copyright_case_preservation_holds: 'advance',
  copyright_claimant_misuse_events: 'advance',
  // Written with the case row, whose clock starts at creation.
  copyright_notice_targets: 'creation',
  copyright_notice_form_intakes: 'creation',
  copyright_territorial_notice_receipts: 'creation',
  // Not a legal fact: delivery, email intake handling, operational retention, audit, matching.
  copyright_notice_delivery_work_items: 'not a legal fact',
  copyright_notice_email_intake_reviews: 'not a legal fact',
  copyright_notice_email_intake_notice_links: 'not a legal fact',
  copyright_notice_email_correspondence_reviews: 'not a legal fact',
  copyright_notice_email_thread_retirements: 'not a legal fact',
  copyright_notice_thread_retention_activities: 'not a legal fact',
  copyright_notice_thread_party_generations: 'not a legal fact',
  copyright_notice_thread_blocker_generations: 'not a legal fact',
  copyright_decision_rationales: 'not a legal fact',
  copyright_trusted_flagger_matches: 'not a legal fact',
  notifications: 'not a legal fact',
}

describe('copyright legal clock coverage', () => {
  afterAll(onGracefulShutdown)

  it('classifies every table that references a case', async () => {
    const { rows } = await read<{ name: string }>(`/* readCopyrightCaseReferencingTables */
      SELECT DISTINCT c.conrelid::regclass::text AS name
      FROM pg_constraint c
      JOIN pg_class child ON child.oid = c.conrelid
      WHERE c.contype = 'f' AND c.confrelid = 'copyright_notices'::regclass
        AND NOT child.relispartition`)
    expect(rows.map(row => row.name).toSorted()).toEqual(Object.keys(caseTables).toSorted())
  })
})
