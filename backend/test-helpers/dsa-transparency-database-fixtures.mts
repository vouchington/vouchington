import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  buildCopyrightDsaStatementPayload,
  type DsaStatementPayload,
} from '../services/copyright-notices/dsa-statement-payload.mts'
import { DSA_EEA_TERRITORIAL_SCOPE } from '../services/copyright-notices/dsa-statement-templates.mts'

/** Synthetic responses matching the Commission's API documentation, read 2026-10-04. */
export const DSA_TEST_UUID = '018f17d8-dff7-7e56-a196-943d8b817169'
export function dsaTestResponse(status: number, body: unknown): Response {
  return Response.json(body, { status })
}
export function dsaTestDuplicateResponse(): Response {
  return dsaTestResponse(422, { existing: { uuid: DSA_TEST_UUID } })
}
export function dsaTestPayload(): DsaStatementPayload {
  return {
    decision_visibility: ['DECISION_VISIBILITY_CONTENT_DISABLED'],
    decision_ground: 'DECISION_GROUND_ILLEGAL_CONTENT',
    content_type: ['CONTENT_TYPE_IMAGE'],
    category: 'STATEMENT_CATEGORY_INTELLECTUAL_PROPERTY_INFRINGEMENTS',
    category_specification: ['KEYWORD_COPYRIGHT_INFRINGEMENT'],
    territorial_scope: [...DSA_EEA_TERRITORIAL_SCOPE],
    content_date: '2026-10-01',
    application_date: '2026-10-04',
    decision_facts: 'A hosted image was restricted after a copyright notice.',
    illegal_content_legal_ground: 'Copyright infringement under applicable EU law.',
    illegal_content_explanation: 'The reported image infringed copyright.',
    source_type: 'SOURCE_ARTICLE_16',
    automated_detection: 'No',
    automated_decision: 'AUTOMATED_DECISION_NOT_AUTOMATED',
    puid: crypto.randomUUID(),
  }
}

export async function buildTestCopyrightDsaPayload(restrictionId: string) {
  await using transaction = await beginTransaction()
  const payload = await buildCopyrightDsaStatementPayload(restrictionId, transaction)
  await transaction.commit()
  return payload
}

export async function readTestDsaImageUploadDate(imageId: string): Promise<string> {
  const { rows } = await read<{ upload_date: string }>(sql`
    SELECT to_char(upload_completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS upload_date
    FROM images WHERE id = ${imageId}
  `)
  if (!rows[0]) throw new Error('Test image missing')
  return rows[0].upload_date
}

/** Only removes a fully retired, already denied live image; retained legal identities remain. */
export async function hardDeleteRetiredTestDsaImage(imageId: string): Promise<void> {
  const { rowCount } = await write(sql`/* hardDeleteRetiredTestDsaImage */
    DELETE FROM images image
    WHERE image.id = ${imageId} AND image.deleted_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM retained_image_placement_bindings binding
        JOIN media_placements placement ON placement.id = binding.placement_id
        WHERE binding.image_id = image.id AND placement.retired_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM media_delivery_registry_records registry
        WHERE registry.image_id = image.id AND registry.desired_state = 'allow'
      )`)
  if (rowCount !== 1) throw new Error('Test image is not safely retired for physical deletion')
}

export async function readTestDsaRetainedImage(imageId: string): Promise<{
  created_by_id: string
  live_image_exists: boolean
  uuid_date: string
  unretired_placements: number
  allowed_registry_records: number
  retained_target_count: number
}> {
  const { rows } = await read<{
    created_by_id: string
    live_image_exists: boolean
    uuid_date: string
    unretired_placements: number
    allowed_registry_records: number
    retained_target_count: number
  }>(sql`/* readTestDsaRetainedImage */
    SELECT retained.created_by_id, image.id IS NOT NULL AS live_image_exists,
      to_char(uuid_extract_timestamp(retained.id) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS uuid_date,
      (SELECT count(*)::int FROM retained_image_placement_bindings binding
       JOIN media_placements placement ON placement.id = binding.placement_id
       WHERE binding.image_id = retained.id AND placement.retired_at IS NULL) AS unretired_placements,
      (SELECT count(*)::int FROM media_delivery_registry_records registry
       WHERE registry.image_id = retained.id AND registry.desired_state = 'allow') AS allowed_registry_records,
      (SELECT count(*)::int FROM copyright_notice_target_images target
       WHERE target.image_id = retained.id) AS retained_target_count
    FROM retained_image_identities retained
    LEFT JOIN images image ON image.id = retained.id
    WHERE retained.id = ${imageId}`)
  if (!rows[0]) throw new Error('Retained image identity missing')
  return rows[0]
}
