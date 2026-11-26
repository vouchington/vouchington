import { beginTransaction } from '@data-stores/psql'

export async function cleanupCopyrightRestoreFixtures(
  notices: string[],
  placements: string[],
  imageId: string,
  options: { analyzeSql: string; hasLegalHoldAssessments: boolean },
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* cleanupCopyrightRestoreFixtures:scope */
      SELECT set_config('app.explain_copyright_restore_notice_ids', $1::uuid[]::text, true),
        set_config('app.explain_copyright_restore_has_assessments', $2::boolean::text, true)`,
    [notices, options.hasLegalHoldAssessments],
  )
  // The purge guards require a separate case and table scope for each delete.
  await transaction(`/* cleanupCopyrightRestoreFixtures:cases */
    DO $cleanup$
    DECLARE notice_id uuid;
    BEGIN
      FOREACH notice_id IN ARRAY current_setting('app.explain_copyright_restore_notice_ids')::uuid[] LOOP
        PERFORM set_config('app.copyright_case_purge_notice_id', notice_id::text, true);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_action_work_items', true);
        DELETE FROM copyright_notice_action_work_items WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_restrictions', true);
        DELETE FROM copyright_restrictions WHERE copyright_notice_id = notice_id;
        IF current_setting('app.explain_copyright_restore_has_assessments')::boolean THEN
          PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_legal_hold_assessments', true);
          DELETE FROM copyright_notice_legal_hold_assessments WHERE copyright_notice_id = notice_id;
        END IF;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_submissions', true);
        DELETE FROM copyright_notice_submissions WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_targets', true);
        DELETE FROM copyright_notice_targets WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notices', true);
        DELETE FROM copyright_notices WHERE id = notice_id;
      END LOOP;
    END;
    $cleanup$`)
  await transaction(
    `/* cleanupCopyrightRestoreFixtures:noticeIdentities */
      DELETE FROM retained_copyright_notice_identities WHERE id = ANY($1::uuid[])`,
    [notices],
  )
  await transaction(
    `/* cleanupCopyrightRestoreFixtures:placements */
      DELETE FROM retained_image_placement_bindings WHERE placement_id = ANY($1::uuid[])`,
    [placements],
  )
  await transaction(
    `/* cleanupCopyrightRestoreFixtures:image */
      DELETE FROM retained_image_identities WHERE id = $1::uuid`,
    [imageId],
  )
  await transaction(options.analyzeSql)
  await transaction.commit()
}
