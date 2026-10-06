import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestCopyrightTargetImageRow = {
  copyright_notice_target_id: string
  placement_id: string
  image_id: string
  binding_family: 'post' | 'surface'
}

/**
 * Leaves a restriction whose target has no image subtype row, the payload builder's 404 case.
 * Replica role bypasses the evidence-immutability trigger for this one transaction only.
 */
export async function removeTestCopyrightTargetImageRow(
  targetId: string,
): Promise<TestCopyrightTargetImageRow> {
  await using transaction = await beginTransaction()
  await transaction(sql`SET LOCAL session_replication_role = replica`)
  const { rows } = await transaction<TestCopyrightTargetImageRow>(sql`
    DELETE FROM copyright_notice_target_images
    WHERE copyright_notice_target_id = ${targetId}
    RETURNING copyright_notice_target_id, placement_id, image_id, binding_family
  `)
  if (!rows[0]) throw new Error('Test copyright target image row missing')
  await transaction.commit()
  return rows[0]
}

/** The data fix: INSERT is not blocked by the immutability trigger. */
export async function restoreTestCopyrightTargetImageRow(
  row: TestCopyrightTargetImageRow,
): Promise<void> {
  await write(sql`
    INSERT INTO copyright_notice_target_images (
      copyright_notice_target_id, placement_id, image_id, binding_family
    ) VALUES (
      ${row.copyright_notice_target_id}, ${row.placement_id}, ${row.image_id}, ${row.binding_family}
    )
  `)
}

export type TestDsaSubmissionForRestriction = {
  id: string
  payload: { puid: string } | null
  failed_at: Date | null
  failure_code: string | null
  submitted_at: Date | null
  available_at: Date
}

export async function readTestDsaSubmissionForRestriction(
  restrictionId: string,
): Promise<TestDsaSubmissionForRestriction> {
  const { rows } = await read<TestDsaSubmissionForRestriction>(sql`
    SELECT id, payload, failed_at, failure_code, submitted_at, available_at
    FROM copyright_dsa_statement_submissions
    WHERE copyright_restriction_id = ${restrictionId}
  `)
  if (!rows[0]) throw new Error('Test DSA submission missing for restriction')
  return rows[0]
}
