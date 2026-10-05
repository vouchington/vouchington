import { mintUUIDv7 } from '@modules/utils/ids'
import { beginTransaction, read, write } from '@data-stores/psql'
import {
  entityRelationMetadatum,
  getEntityRelationIntegrityTargetColumn,
} from '@voucha/types/entities/entity-relations-metadata'

const ROOT_TABLES = {
  user: 'retained_user_identities',
  membership: 'retained_membership_identities',
  api_key: 'retained_api_key_identities',
  topic: 'retained_topic_identities',
  post: 'retained_post_identities',
  rss_feed_item: 'retained_rss_feed_item_identities',
  image: 'retained_image_identities',
} as const

type RetainedIdentityFamily = keyof typeof ROOT_TABLES

function retainedRelationTable(relationTable: string): string {
  if (
    !entityRelationMetadatum.some(
      metadata => metadata.election && metadata.table_name === relationTable,
    )
  ) {
    throw new Error(`Unknown elected relation table: ${relationTable}`)
  }
  return `retained_${relationTable}`
}

export async function insertTestRetainedRelationImpact(options: {
  requestId: string
  relationTable: string
  subjectId: string
  relationId: string
}): Promise<string> {
  const metadata = entityRelationMetadatum.find(
    entry => entry.election && entry.table_name === options.relationTable,
  )
  if (!metadata) throw new Error(`Unknown elected relation table: ${options.relationTable}`)
  await using query = await beginTransaction()
  await query(
    `/* insertTestRetainedRelationOwner */ INSERT INTO ${retainedRelationTable(options.relationTable)} (subject_id, id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [options.subjectId, options.relationId],
  )
  const { rows } = await query<{ id: string }>(
    `/* insertTestRetainedRelationImpact */ INSERT INTO user_deletion_relation_impacts (request_id, subject_id, ${getEntityRelationIntegrityTargetColumn(metadata)}) VALUES ($1, $2, $3) RETURNING id`,
    [options.requestId, options.subjectId, options.relationId],
  )
  await query.commit()
  return rows[0]!.id
}

export async function deleteTestRetainedRelationImpact(impactId: string): Promise<void> {
  await write(
    '/* deleteTestRetainedRelationImpact */ DELETE FROM user_deletion_relation_impacts WHERE id = $1',
    [impactId],
  )
}

export async function hasTestRetainedRelationIdentity(
  relationTable: string,
  subjectId: string,
  relationId: string,
): Promise<boolean> {
  const { rowCount } = await read(
    `/* hasTestRetainedRelationIdentity */ SELECT 1 FROM ${retainedRelationTable(relationTable)} WHERE subject_id = $1 AND id = $2`,
    [subjectId, relationId],
  )
  return (rowCount ?? 0) > 0
}

export async function readTestRetainedRelationTraversalBound(
  relationTable: string,
  pageSize: number,
): Promise<number> {
  const { rows } = await read<{ count: string }>(
    `/* readTestRetainedRelationTraversalBound */ SELECT COUNT(*)::text AS count FROM ${retainedRelationTable(relationTable)}`,
  )
  return Math.ceil(Number(rows[0]!.count) / pageSize) + 2
}

export async function hasTestRetainedIdentityRoot(
  family: RetainedIdentityFamily,
  id: string,
): Promise<boolean> {
  const { rowCount } = await read(
    `/* hasTestRetainedIdentityRoot */ SELECT id FROM ${ROOT_TABLES[family]} WHERE id = $1`,
    [id],
  )
  return (rowCount ?? 0) > 0
}

export async function readTestRetainedIdentityTraversalBound(
  family: RetainedIdentityFamily,
  pageSize: number,
): Promise<number> {
  const { rows } = await read<{ count: string }>(
    `/* readTestRetainedIdentityTraversalBound */ SELECT COUNT(*)::text AS count FROM ${ROOT_TABLES[family]}`,
  )
  return Math.ceil(Number(rows[0]!.count) / pageSize) + 2
}

export async function insertTestRetainedIdentityRoot(
  family: RetainedIdentityFamily,
  id: string,
): Promise<void> {
  await write(
    `/* insertTestRetainedIdentityRoot */ INSERT INTO ${ROOT_TABLES[family]} (id) VALUES ($1)`,
    [id],
  )
}

export async function createTestRetainedMembershipIdentity(): Promise<string> {
  const id = mintUUIDv7()
  await insertTestRetainedIdentityRoot('membership', id)
  return id
}

export async function readTestRetainedMembershipChangeIds(membershipId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(
    '/* readTestRetainedMembershipChangeIds */ SELECT id FROM membership_changes WHERE membership_id = $1 ORDER BY id',
    [membershipId],
  )
  return rows.map(row => row.id)
}
