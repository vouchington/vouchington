import type { TransactionQuery } from '@data-stores/psql'

export async function cleanupCopyrightRecoveryFixture(
  transaction: TransactionQuery,
  notices: string[],
  image?: { id: string; placements: string[] },
): Promise<void> {
  await transaction(
    `/* cleanupCopyrightRecoveryFixture:scope */
      SELECT set_config('app.explain_copyright_recovery_notice_ids', $1::uuid[]::text, true)`,
    [notices],
  )
  // The purge guards require a separate case and table scope for each delete.
  await transaction(`/* cleanupCopyrightRecoveryFixture:cases */
    DO $cleanup$
    DECLARE notice_id uuid;
    BEGIN
      FOREACH notice_id IN ARRAY current_setting('app.explain_copyright_recovery_notice_ids')::uuid[] LOOP
        PERFORM set_config('app.copyright_case_purge_notice_id', notice_id::text, true);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_delivery_recipients', true);
        DELETE FROM copyright_notice_delivery_recipients WHERE copyright_notice_delivery_work_item_id IN (
          SELECT id FROM copyright_notice_delivery_work_items WHERE copyright_notice_id = notice_id);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_delivery_attempts', true);
        DELETE FROM copyright_notice_delivery_attempts WHERE work_item_id IN (
          SELECT id FROM copyright_notice_delivery_work_items WHERE copyright_notice_id = notice_id);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_delivery_work_items', true);
        DELETE FROM copyright_notice_delivery_work_items WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_correspondence_messages', true);
        DELETE FROM copyright_notice_correspondence_messages WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_action_attempts', true);
        DELETE FROM copyright_notice_action_attempts
        WHERE work_item_id IN (SELECT id FROM copyright_notice_action_work_items WHERE copyright_notice_id = notice_id);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_action_work_items', true);
        DELETE FROM copyright_notice_action_work_items WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_deadlines', true);
        DELETE FROM copyright_notice_deadlines WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_counter_notice_assessment_targets', true);
        DELETE FROM copyright_notice_counter_notice_assessment_targets WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_restrictions', true);
        DELETE FROM copyright_restrictions WHERE copyright_notice_id = notice_id;
        UPDATE copyright_notice_submissions SET current_assessment_identity_id = NULL,
          current_assessment_is_substantially_compliant = NULL, current_assessed_at = NULL,
          current_assessed_by_id = NULL, current_assessment_form_screening_id = NULL
        WHERE copyright_notice_id = notice_id AND current_assessment_identity_id IS NOT NULL;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_submission_assessments', true);
        DELETE FROM copyright_notice_submission_assessments WHERE copyright_notice_id = notice_id;
        DELETE FROM copyright_notice_submission_assessment_identities WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_form_screening_attempts', true);
        DELETE FROM copyright_notice_form_screening_attempts WHERE copyright_notice_form_intake_id IN (
          SELECT id FROM copyright_notice_form_intakes WHERE copyright_notice_id = notice_id);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_form_screenings', true);
        DELETE FROM copyright_notice_form_screenings WHERE copyright_notice_form_intake_id IN (
          SELECT id FROM copyright_notice_form_intakes WHERE copyright_notice_id = notice_id);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_form_intakes', true);
        DELETE FROM copyright_notice_form_intakes WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_submissions', true);
        DELETE FROM copyright_notice_submissions WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_target_images', true);
        DELETE FROM copyright_notice_target_images WHERE copyright_notice_target_id IN (
          SELECT id FROM copyright_notice_targets WHERE copyright_notice_id = notice_id);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_targets', true);
        DELETE FROM copyright_notice_targets WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notices', true);
        DELETE FROM copyright_notices WHERE id = notice_id;
      END LOOP;
    END;
    $cleanup$`)
  await transaction(
    `/* cleanupCopyrightRecoveryFixture:parties */
      DELETE FROM copyright_notice_party_identities WHERE copyright_notice_id = ANY($1::uuid[])`,
    [notices],
  )
  await transaction(
    `/* cleanupCopyrightRecoveryFixture:noticeIdentities */
      DELETE FROM retained_copyright_notice_identities WHERE id = ANY($1::uuid[])`,
    [notices],
  )
  if (image === undefined) return
  await transaction(
    `/* cleanupCopyrightRecoveryFixture:placements */
      DELETE FROM retained_image_placement_bindings WHERE placement_id = ANY($1::uuid[])`,
    [image.placements],
  )
  await transaction(
    `/* cleanupCopyrightRecoveryFixture:image */
      DELETE FROM retained_image_identities WHERE id = $1::uuid`,
    [image.id],
  )
}
