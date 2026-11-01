import type { TransactionQuery } from '@data-stores/psql'
import type { CopyrightCasePurgeJobData } from '../../queues/psql/types.mts'
import sql from 'sql-template-strings'
import { deleteCopyrightEvidenceObjectVersionPage } from './retention-erasure-s3.mts'

type OwnerCursor = CopyrightCasePurgeJobData['evidenceOwner']
type EvidenceSource = { id: string; intake_id: string | null; storage_object_id: string | null }
type ObjectRow = {
  id: string
  storage_key: string
  is_deletion_claimed: boolean
  reference_generation: string
}
type OwnerRow = { id: string; copyright_notice_id: string | null }

type EvidencePage = {
  nextId: string | null
  nextSourceIndex: number
  hasMore: boolean
  evidenceOwner?: OwnerCursor
}

/** One source, one bounded ownership proof page or one physical S3 version page. */
export async function eraseCopyrightCaseEvidencePage(
  query: TransactionQuery,
  noticeId: string,
  sourceIndex: number,
  afterId: string | null,
  ownerCursor: OwnerCursor,
  workLimit: number,
): Promise<EvidencePage> {
  if (!Number.isInteger(workLimit) || workLimit < 1 || workLimit > 100)
    throw new Error('Invalid copyright evidence page size')
  if (sourceIndex > 1) return { nextId: null, nextSourceIndex: sourceIndex, hasMore: false }
  const cursor = afterId === null ? sql`` : sql` AND id > ${afterId}::uuid`
  const sourceQuery =
    sourceIndex === 0
      ? sql`/* readCopyrightCaseEvidenceArtifact */
        SELECT id, NULL::uuid AS intake_id, storage_object_id
        FROM copyright_notice_evidence_artifacts
        WHERE copyright_notice_id = ${noticeId}::uuid`
          .append(cursor)
          .append(sql` ORDER BY id LIMIT 1`)
      : sql`/* readCopyrightCaseEmailEvidence */
        SELECT link.id, intake.id AS intake_id, intake.raw_storage_object_id AS storage_object_id
        FROM copyright_notice_email_intake_notice_links link
        JOIN copyright_notice_email_intakes intake ON intake.id = link.copyright_notice_email_intake_id
        WHERE link.copyright_notice_id = ${noticeId}::uuid`
          .append(afterId === null ? sql`` : sql` AND link.id > ${afterId}::uuid`)
          .append(sql` ORDER BY link.id LIMIT 1`)
  const { rows: sources } = await query<EvidenceSource>(sourceQuery)
  const source = sources[0]
  if (!source) return { nextId: null, nextSourceIndex: sourceIndex + 1, hasMore: true }
  if (!source.storage_object_id)
    return { nextId: source.id, nextSourceIndex: sourceIndex, hasMore: true }

  // Ingestion and thread association lock the intake before the registry (and
  // sometimes before the notice). A bounded try prevents an inverse lock wait
  // while this page already owns the notice row.
  if (source.intake_id)
    await query(sql`/* tryLockCopyrightCaseEvidenceIntake */
      SELECT id FROM copyright_notice_email_intakes
      WHERE id = ${source.intake_id}::uuid FOR UPDATE NOWAIT`)

  // New FK writers take SHARE on this registry row. Every proof page gets a fresh
  // READ COMMITTED snapshot after the registry lock, then checks its generation.
  const { rows: objects } = await query<ObjectRow>(sql`/* lockCopyrightCaseEvidenceObject */
    SELECT id, storage_key, is_deletion_claimed, reference_generation::text
    FROM copyright_notice_storage_objects
    WHERE id = ${source.storage_object_id}::uuid FOR UPDATE NOWAIT`)
  const object = objects[0]
  if (!object) throw new Error('Copyright evidence registry row is missing')

  if (!object.is_deletion_claimed) {
    const proof: NonNullable<OwnerCursor> =
      ownerCursor?.objectId === object.id && ownerCursor.generation === object.reference_generation
        ? ownerCursor
        : {
            objectId: object.id,
            generation: object.reference_generation,
            family: 'artifacts',
            afterId: null,
          }
    const ownerAfter = proof.afterId === null ? sql`` : sql` AND id > ${proof.afterId}::uuid`
    let ownerQuery = sql`/* readCopyrightEvidenceArtifactOwners */
      SELECT id, copyright_notice_id FROM copyright_notice_evidence_artifacts
      WHERE storage_object_id = ${object.id}::uuid`.append(ownerAfter).append(sql`
      ORDER BY id LIMIT ${workLimit}`)
    if (proof.family === 'intakes')
      ownerQuery = sql`/* readCopyrightEvidenceIntakeOwners */
        SELECT intake.id, link.copyright_notice_id
        FROM copyright_notice_email_intakes intake
        LEFT JOIN copyright_notice_email_intake_notice_links link
          ON link.copyright_notice_email_intake_id = intake.id
        WHERE intake.raw_storage_object_id = ${object.id}::uuid`
        .append(proof.afterId === null ? sql`` : sql` AND intake.id > ${proof.afterId}::uuid`)
        .append(sql` ORDER BY intake.id LIMIT ${workLimit}`)
    const { rows: owners } = await query<OwnerRow>(ownerQuery)
    if (owners.some(owner => owner.copyright_notice_id !== noticeId))
      return { nextId: source.id, nextSourceIndex: sourceIndex, hasMore: true }
    if (owners.length === workLimit)
      return {
        nextId: afterId,
        nextSourceIndex: sourceIndex,
        hasMore: true,
        evidenceOwner: { ...proof, afterId: owners.at(-1)!.id },
      }
    if (proof.family === 'artifacts')
      return {
        nextId: afterId,
        nextSourceIndex: sourceIndex,
        hasMore: true,
        evidenceOwner: { ...proof, family: 'intakes', afterId: null },
      }
    // No ownership mutation could commit while the registry lock was held. The
    // one-way claim commits in this run, before any irreversible S3 operation.
    await query(sql`/* scopeCopyrightCaseEvidenceClaim */
      SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true),
        set_config('app.copyright_case_purge_table', 'copyright_notice_storage_objects', true)`)
    await query(sql`/* claimCopyrightCaseEvidenceObjectDeletion */
      UPDATE copyright_notice_storage_objects SET is_deletion_claimed = true
      WHERE id = ${object.id}::uuid AND NOT is_deletion_claimed
        AND reference_generation = ${object.reference_generation}::bigint`)
    return { nextId: afterId, nextSourceIndex: sourceIndex, hasMore: true }
  }

  const page = await deleteCopyrightEvidenceObjectVersionPage(object.storage_key, workLimit)
  if (page.hasMore) return { nextId: afterId, nextSourceIndex: sourceIndex, hasMore: true }
  await query(sql`/* scopeCopyrightCaseEvidenceUnlink */
    SET LOCAL app.copyright_retention_erasure = 'on'`)
  await query(sql`/* scopeCopyrightCaseEvidenceReferenceUnlink */
    SELECT set_config('app.copyright_case_purge_notice_id', ${noticeId}, true),
      set_config('app.copyright_case_purge_table', ${sourceIndex === 0 ? 'copyright_notice_evidence_artifacts' : 'copyright_notice_email_intakes'}, true)`)
  if (sourceIndex === 0) {
    await query(sql`/* unlinkCopyrightCaseEvidenceArtifact */
      UPDATE copyright_notice_evidence_artifacts SET storage_object_id = NULL
      WHERE id = ${source.id}::uuid AND storage_object_id = ${object.id}::uuid`)
  } else {
    await query(sql`/* unlinkCopyrightCaseEmailEvidence */
      UPDATE copyright_notice_email_intakes SET raw_storage_object_id = NULL
      WHERE id = ${source.intake_id}::uuid AND raw_storage_object_id = ${object.id}::uuid`)
  }
  await query(sql`/* deleteUnreferencedCopyrightEvidenceRegistry */
    DELETE FROM copyright_notice_storage_objects object WHERE object.id = ${object.id}::uuid
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_evidence_artifacts artifact
        WHERE artifact.storage_object_id = object.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intakes intake
        WHERE intake.raw_storage_object_id = object.id)`)
  return { nextId: source.id, nextSourceIndex: sourceIndex, hasMore: true }
}
