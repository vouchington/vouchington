import { assertNever } from '@modules/utils/assert-never'
import { mintUUIDv7 } from '@modules/utils/ids'
import { beginTransaction, read, write, type QueryOptions } from '@data-stores/psql'
import {
  entityRelationMetadatum,
  getEntityRelationIntegrityTargetColumn,
} from '@voucha/types/entities/entity-relations-metadata'

type RetainedIdentityFamily =
  | 'user'
  | 'membership'
  | 'api_key'
  | 'topic'
  | 'post'
  | 'rss_feed_item'
  | 'image'

function retainedRootTable(family: RetainedIdentityFamily): string {
  switch (family) {
    case 'user':
      return 'retained_user_identities'
    case 'membership':
      return 'retained_membership_identities'
    case 'api_key':
      return 'retained_api_key_identities'
    case 'topic':
      return 'retained_topic_identities'
    case 'post':
      return 'retained_post_identities'
    case 'rss_feed_item':
      return 'retained_rss_feed_item_identities'
    case 'image':
      return 'retained_image_identities'
    default:
      return assertNever(family, 'Unknown retained identity family')
  }
}

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

export async function insertTestRetainedRelationIdentity(
  relationTable: string,
  subjectId: string,
  relationId: string,
  options: QueryOptions = {},
): Promise<void> {
  await write(
    `/* insertTestRetainedRelationIdentity */ INSERT INTO ${retainedRelationTable(relationTable)} (subject_id, id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [subjectId, relationId],
    options,
  )
}

export async function hasTestRetainedRelationIdentity(
  relationTable: string,
  subjectId: string,
  relationId: string,
  options: QueryOptions = {},
): Promise<boolean> {
  const { rowCount } = await read(
    `/* hasTestRetainedRelationIdentity */ SELECT 1 FROM ${retainedRelationTable(relationTable)} WHERE subject_id = $1 AND id = $2`,
    [subjectId, relationId],
    options,
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
    `/* hasTestRetainedIdentityRoot */ SELECT id FROM ${retainedRootTable(family)} WHERE id = $1`,
    [id],
  )
  return (rowCount ?? 0) > 0
}

export async function readTestRetainedIdentityTraversalBound(
  family: RetainedIdentityFamily,
  pageSize: number,
): Promise<number> {
  const { rows } = await read<{ count: string }>(
    `/* readTestRetainedIdentityTraversalBound */ SELECT COUNT(*)::text AS count FROM ${retainedRootTable(family)}`,
  )
  return Math.ceil(Number(rows[0]!.count) / pageSize) + 2
}

export async function insertTestRetainedIdentityRoot(
  family: Exclude<RetainedIdentityFamily, 'image'>,
  id: string,
  options: QueryOptions = {},
): Promise<void> {
  await write(
    `/* insertTestRetainedIdentityRoot */ INSERT INTO ${retainedRootTable(family)} (id) VALUES ($1)`,
    [id],
    options,
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
