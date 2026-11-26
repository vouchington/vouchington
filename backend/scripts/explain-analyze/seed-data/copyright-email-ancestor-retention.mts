import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { createUnparsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import sql from 'sql-template-strings'

const backgroundRootsPerDirection = 8
const linkedReceiptsPerNeighbor = 4
export const ancestorEdgeTable = 'copyright_notice_email_message_ancestors'

export async function seedCopyrightEmailAncestorRetention(pageSize: number) {
  const template = await createUnparsedCopyrightEmailIntake()
  const backgroundLinkCount = pageSize * linkedReceiptsPerNeighbor
  const cohortSize = pageSize + 1 + backgroundLinkCount
  const prefix = `explain-ancestor-retention-${randomUUID()}`
  await using query = await beginTransaction()
  // Scale the graph from one valid intake, sharing its live raw object. At this boundary
  // only distinct receipt identities, ordered graph edges and notice links affect the sweep.
  const { rows } = await query<{ id: string }>(sql`
    /* seedEmailAncestorRetentionReceipts */
    INSERT INTO copyright_notice_email_intake_receipts (
      amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size
    )
    SELECT ${prefix} || '-' || n, receipt.raw_sha256, receipt.raw_storage_key_sha256,
      receipt.raw_byte_size
    FROM copyright_notice_email_intake_receipts receipt
    CROSS JOIN generate_series(1, ${cohortSize + 2 + 2 * backgroundRootsPerDirection}::int) AS fixture(n)
    WHERE receipt.id = ${template.id}
    RETURNING id
  `)
  const ids = rows.map(row => row.id).toSorted()
  const ancestorRoot = ids[0]!
  const cohortStart = 1 + backgroundRootsPerDirection
  const cohortEnd = cohortStart + cohortSize
  const backgroundAncestors = ids.slice(1, cohortStart)
  const cohort = ids.slice(cohortStart, cohortEnd)
  const isNeighbor = (index: number) => index % (linkedReceiptsPerNeighbor + 1) === 0
  const neighbors = cohort.filter((_, index) => isNeighbor(index))
  const replyRoot = ids[cohortEnd]!
  const backgroundReplies = ids.slice(cohortEnd + 1)
  const protectedNeighbor = neighbors[pageSize - 1]!
  // Interleave unrelated linked receipts so scanning their whole index is distinguishable
  // from an existence probe keyed to each inspected neighbor.
  const linkedIds = [protectedNeighbor, ...cohort.filter((_, index) => !isNeighbor(index))]
  await query(sql`
    /* seedEmailAncestorRetentionIntakes */
    INSERT INTO copyright_notice_email_intakes (
      id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256, raw_media_type_id,
      raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict
    )
    SELECT receipt.id, receipt.amazon_ses_message_id, template.received_at,
      template.raw_storage_object_id, template.raw_sha256, template.raw_media_type_id,
      template.raw_byte_size, template.spf_verdict, template.dkim_verdict, template.dmarc_verdict,
      template.spam_verdict, template.virus_verdict
    FROM copyright_notice_email_intake_receipts receipt
    CROSS JOIN copyright_notice_email_intakes template
    WHERE receipt.id = ANY(${ids}::uuid[]) AND template.id = ${template.id}
  `)
  await query(sql`
    /* seedEmailAncestorRetentionEdges */
    INSERT INTO copyright_notice_email_message_ancestors (
      reply_message_intake_receipt_id, ancestor_message_intake_receipt_id, reference_kind
    )
    SELECT reply_id, neighbor_id, 'references'::copyright_notice_email_thread_reference_kinds
    FROM unnest(${[replyRoot, ...backgroundReplies]}::uuid[]) AS replies(reply_id)
    CROSS JOIN unnest(${neighbors}::uuid[]) AS neighbors(neighbor_id)
    UNION ALL
    SELECT neighbor_id, ancestor_id, 'references'::copyright_notice_email_thread_reference_kinds
    FROM unnest(${[ancestorRoot, ...backgroundAncestors]}::uuid[]) AS ancestors(ancestor_id)
    CROSS JOIN unnest(${neighbors}::uuid[]) AS neighbors(neighbor_id)
  `)
  await query(sql`
    /* seedEmailAncestorRetentionProtectedLink */
    WITH owners AS MATERIALIZED (
      SELECT intake_id, uuidv7() AS notice_id FROM unnest(${linkedIds}::uuid[]) AS fixture(intake_id)
    ), notices AS (
      INSERT INTO copyright_notices (
        id, jurisdiction, legal_basis, received_at, claimant_contact_ciphertext, work_description, policy_version
      )
      SELECT notice_id, 'us_dmca', 'copyright', CURRENT_TIMESTAMP, 'explain-contact',
        'Explain ancestry', 'explain-v1' FROM owners
      RETURNING id
    )
    INSERT INTO copyright_notice_email_intake_notice_links (
      copyright_notice_email_intake_id, copyright_notice_id, link_kind
    )
    SELECT owners.intake_id, notices.id, 'initial' FROM owners JOIN notices ON notices.id = owners.notice_id
  `)
  await query(`/* analyzeEmailAncestorRetentionCapacity */
    ANALYZE copyright_notice_email_message_ancestors, copyright_notice_email_intake_notice_links`)
  const {
    rows: [links],
  } = await query<{ count: number }>(sql`
    /* countEmailAncestorRetentionSeedLinks */
    SELECT count(*)::int AS count FROM copyright_notice_email_intake_notice_links
  `)
  await query.commit()
  return {
    ancestorRoot,
    replyRoot,
    neighbors,
    protectedNeighbor,
    backgroundAncestors,
    backgroundReplies,
    linkCount: links!.count,
  }
}
