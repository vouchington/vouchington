import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Inventory the case records protected by this account hold, in its placement transaction. */
async function readUserCopyrightCases(query: QueryExecutor, userId: string) {
  const sources = await Promise.all([
    query<{ id: string }>(sql`/* readUserPreservationRetainedCases */
      SELECT copyright_notice_id AS id FROM copyright_notice_party_identities
      WHERE account_user_id = ${userId}`),
    query<{ id: string }>(sql`/* readUserPreservationClaimantCases */
      SELECT id FROM copyright_notices WHERE claimant_user_id = ${userId}`),
    query<{ id: string }>(sql`/* readUserPreservationSubmittedCases */
      SELECT copyright_notice_id AS id FROM copyright_notice_submissions
      WHERE submitted_by_id = ${userId}`),
    query<{ id: string }>(sql`/* readUserPreservationIncidentCases */
      SELECT copyright_notice_id AS id FROM copyright_repeat_infringer_incidents
      WHERE account_user_id = ${userId}`),
    query<{ id: string }>(sql`/* readUserPreservationPostCases */
      SELECT target.copyright_notice_id AS id FROM posts post
      JOIN image_placements binding ON binding.post_id = post.id
      JOIN copyright_notice_targets target ON target.placement_id = binding.placement_id
      WHERE post.created_by_id = ${userId}`),
    query<{ id: string }>(sql`/* readUserPreservationProfileCases */
      SELECT target.copyright_notice_id AS id FROM copyright_notice_targets target
      JOIN image_surface_placements surface ON surface.placement_id = target.placement_id
      WHERE target.surface_owner_user_id = ${userId}
        AND surface.surface_kind IN ('user-profile-image', 'user-profile-link-image')`),
    query<{ id: string }>(sql`/* readUserPreservationCommunityCases */
      SELECT target.copyright_notice_id AS id FROM image_surface_placement_activations activation
      JOIN image_surface_placements surface ON surface.placement_id = activation.placement_id
      JOIN copyright_notice_targets target ON target.placement_id = activation.placement_id
        AND target.surface_activation_revision = activation.placement_revision
      WHERE activation.bound_by_id = ${userId}
        AND surface.surface_kind IN ('community-profile-image', 'community-banner-image')`),
  ])
  const cases = [...new Set(sources.flatMap(source => source.rows.map(row => row.id)))]
  return cases
}

/** Inventory all records preserved by an account hold. */
export async function readUserCopyrightPreservationCoverage(query: QueryExecutor, userId: string) {
  const cases = await readUserCopyrightCases(query, userId)
  await readCopyrightCasePreservationCoverage(query, cases)
  return cases
}

/** Account erasure changes case qualification, so inventory the affected thread records. */
export async function readUserCopyrightThreadProtectedRecords(
  query: QueryExecutor,
  userId: string,
) {
  const [parties, requesters] = await Promise.all([
    readUserCopyrightCases(query, userId),
    query<{ copyright_notice_id: string }>(sql`/* readErasedCopyrightRequesterCases */
      SELECT copyright_notice_id FROM copyright_notice_form_intakes WHERE requester_user_id = ${userId}`),
  ])
  await readCopyrightThreadRetirement(query, [
    ...new Set([...parties, ...requesters.rows.map(row => row.copyright_notice_id)]),
  ])
}

/** Existing case work protects these records from operational thread retirement. */
async function readCopyrightHeldThreadRecords(query: QueryExecutor, cases: readonly string[]) {
  const { rows } = await query<{
    earliest_created_at: Date | null
  }>(sql`/* readCopyrightThreadProtectedRecords */ SELECT
    (SELECT min(created_at) FROM copyright_notices WHERE id = ANY(${cases}::uuid[])) AS earliest_created_at,
    (SELECT count(matched_token_id) FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_id = ANY(${cases}::uuid[])) AS links,
    (SELECT count(*) FROM copyright_notice_email_thread_retirements
      WHERE copyright_notice_id = ANY(${cases}::uuid[])) AS retirements,
    (SELECT count(*) FROM copyright_notice_email_thread_references reference
      JOIN copyright_notice_email_intake_notice_links link
        ON link.copyright_notice_email_intake_id = reference.copyright_notice_email_intake_id
      WHERE link.copyright_notice_id = ANY(${cases}::uuid[])) AS references,
    (SELECT count(*) FROM copyright_notice_email_message_ancestors edge
      JOIN copyright_notice_email_intake_notice_links link
        ON link.copyright_notice_email_intake_id = edge.reply_message_intake_receipt_id
      WHERE link.copyright_notice_id = ANY(${cases}::uuid[])) AS reply_edges,
    (SELECT count(*) FROM copyright_notice_email_message_ancestors edge
      JOIN copyright_notice_email_intake_notice_links link
        ON link.copyright_notice_email_intake_id = edge.ancestor_message_intake_receipt_id
      WHERE link.copyright_notice_id = ANY(${cases}::uuid[])) AS ancestor_edges`)
  return rows[0]?.earliest_created_at ?? null
}

/** Record families covered by a case hold, including both directions of shared ancestry. */
export async function readCopyrightCasePreservationCoverage(
  query: QueryExecutor,
  cases: readonly string[],
) {
  const earliestCreatedAt = await readCopyrightHeldThreadRecords(query, cases)
  if (!earliestCreatedAt) return
  const lifecycleLowerBound = getMinUUIDv7ForDate(earliestCreatedAt)
  // Counts inventory all covered rows without returning an unbounded evidence list.
  await query(sql`/* readUserCopyrightPreservationCoverage */ SELECT
    (SELECT count(evidence_erased_at) FROM copyright_notices WHERE id = ANY(${cases}::uuid[])) AS notices,
    (SELECT count(*) FROM copyright_notice_lifecycle_changes
      WHERE id >= ${lifecycleLowerBound}::uuid
        AND copyright_notice_id = ANY(${cases}::uuid[])) AS lifecycle_changes,
    (SELECT count(*) FROM copyright_notice_evidence_artifacts artifact
      JOIN copyright_notice_submissions submission ON submission.id = artifact.copyright_notice_submission_id
      WHERE submission.copyright_notice_id = ANY(${cases}::uuid[])) AS artifacts,
    (SELECT count(object.is_deletion_claimed) FROM copyright_notice_storage_objects object
      JOIN copyright_notice_evidence_artifacts artifact ON artifact.storage_object_id = object.id
      JOIN copyright_notice_submissions submission ON submission.id = artifact.copyright_notice_submission_id
      WHERE submission.copyright_notice_id = ANY(${cases}::uuid[])) AS artifact_objects,
    (SELECT count(object.is_deletion_claimed) FROM copyright_notice_storage_objects object
      JOIN copyright_notice_email_intakes intake ON intake.raw_storage_object_id = object.id
      JOIN copyright_notice_email_intake_notice_links link ON link.copyright_notice_email_intake_id = intake.id
      WHERE link.copyright_notice_id = ANY(${cases}::uuid[])) AS intake_objects,
    (SELECT count(*) FROM copyright_notice_email_intakes intake
      JOIN copyright_notice_email_intake_notice_links link
        ON link.copyright_notice_email_intake_id = intake.id
      WHERE link.copyright_notice_id = ANY(${cases}::uuid[])) AS intakes`)
}

/** Inventory the complete retirement cohort, even after one existing marker is found. */
export async function readCopyrightThreadRetirement(
  query: QueryExecutor,
  cases: readonly string[],
): Promise<boolean> {
  const { rows } = await query<{ is_retired: boolean }>(sql`/* readCopyrightThreadRetirement */
    -- no-mistakes-disable-next-line postgres-sql-shape-policy: reciprocal SSI coverage must consume every case key, including keys after an existing marker; EXISTS would short-circuit.
    SELECT count(*) > 0 AS is_retired FROM copyright_notice_email_thread_retirements
    WHERE copyright_notice_id = ANY(${cases}::uuid[])`)
  return rows[0]!.is_retired
}

export async function readCopyrightScreeningCoverage(query: QueryExecutor, intakeId: string) {
  const { rows } = await query<{ copyright_notice_id: string }>(sql`
    /* readCopyrightScreeningCoverage */ SELECT copyright_notice_id
    FROM copyright_notice_form_intakes WHERE id = ${intakeId}`)
  if (rows[0]) await readCopyrightThreadRetirement(query, [rows[0].copyright_notice_id])
}
