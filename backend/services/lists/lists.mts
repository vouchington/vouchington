import { beginTransaction, read, write } from '@data-stores/psql'
import assert from 'http-assert'
import { buildPageInfo, decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { List, ListVisibility } from './types.mts'
import { invalidate } from '@services/entity-cache/invalidate'

function rowToList(row: Record<string, unknown>): List {
  return {
    __entity_type: 'list',
    id: row.id as string,
    owner_user_id: row.owner_user_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    visibility: row.visibility as ListVisibility,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
    removed_at: (row.removed_at as Date | null) ?? null,
  }
}

export async function createList(
  provenance: ContentProvenance,
  currentUserId: string,
  data: { name: string; description?: string | null; visibility?: ListVisibility },
): Promise<List> {
  await using query = await beginTransaction()
  await query(`/* createList.lockActiveUser */ SELECT fn_lock_active_user_for_mutation($1)`, [
    currentUserId,
  ])
  const { rows } = await query(
    `/* createList */
      INSERT INTO lists (
        owner_user_id, name, description, visibility, created_via, created_via_oauth_client_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, owner_user_id, name, description, visibility, created_at, updated_at, removed_at
      `,
    [
      currentUserId,
      data.name,
      data.description ?? null,
      data.visibility ?? 'private',
      provenance.createdVia,
      provenance.oauthClientId,
    ],
  )
  await query.commit()
  const list = rowToList(rows[0]!)
  await invalidate.lists(list.id)
  return list
}

export async function getList(listId: string): Promise<List | null> {
  return fetchListById(read, listId)
}

export async function getListForWrite(listId: string): Promise<List | null> {
  return fetchListById(write, listId)
}

async function fetchListById(query: typeof read, listId: string): Promise<List | null> {
  const { rows } = await query(
    `/* fetchListById */
    SELECT id, owner_user_id, name, description, visibility, created_at, updated_at, removed_at
    FROM lists
    WHERE id = $1
      AND removed_at IS NULL
    LIMIT 1
    `,
    [listId],
  )
  if (rows.length === 0) return null
  return rowToList(rows[0]!)
}

export async function updateList(
  currentUserId: string,
  listId: string,
  data: { name?: string; description?: string | null; visibility?: ListVisibility },
): Promise<List> {
  await using query = await beginTransaction()
  await query(`/* updateList.lockActiveUser */ SELECT fn_lock_active_user_for_mutation($1)`, [
    currentUserId,
  ])
  const { rows } = await query(
    `/* updateList */
      UPDATE lists
      SET
        name = COALESCE($3, name),
        description = CASE WHEN $4::boolean THEN $5 ELSE description END,
        visibility = COALESCE($6, visibility)
      WHERE id = $1
        AND owner_user_id = $2
        AND removed_at IS NULL
      RETURNING id, owner_user_id, name, description, visibility, created_at, updated_at, removed_at
      `,
    [
      listId,
      currentUserId,
      data.name ?? null,
      'description' in data,
      data.description ?? null,
      data.visibility ?? null,
    ],
  )
  await query.commit()
  assert(rows.length > 0, 404, 'List not found')
  const list = rowToList(rows[0]!)
  await invalidate.lists(list.id)
  return list
}

export async function softDeleteList(currentUserId: string, listId: string): Promise<void> {
  const { rows } = await write(
    `/* softDeleteList */
    UPDATE lists
    SET removed_at = NOW()
    WHERE id = $1
      AND owner_user_id = $2
      AND removed_at IS NULL
    RETURNING id
    `,
    [listId, currentUserId],
  )
  assert(rows.length > 0, 404, 'List not found')
  await invalidate.lists(listId)
}

export async function searchUserLists(
  ownerUserId: string,
  options: { limit?: number; after?: string } = {},
): Promise<{ results: List[]; page_info: PageInfo }> {
  const limit = options.limit ?? 20
  assert(Number.isInteger(limit), 422, 'limit must be an integer')
  assert(limit > 0 && limit <= 100, 422, 'limit must be between 1 and 100')

  const params: unknown[] = [ownerUserId]
  let sql = `/* searchUserLists */
    SELECT id, owner_user_id, name, description, visibility, created_at, updated_at, removed_at
    FROM lists
    WHERE owner_user_id = $1
      AND removed_at IS NULL
  `

  if (options.after) {
    const cursor = decodeUuidCursor(
      options.after,
      isSimpleCursor,
      'Invalid cursor format: expected id cursor',
    )
    params.push(cursor.id)
    sql += ` AND id < $${params.length}::uuid`
  }

  sql += ` ORDER BY id DESC LIMIT $${params.length + 1}`
  params.push(limit + 1)

  const { rows } = await read(sql, params)
  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit).map(rowToList)

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: r => ({ id: r.id }),
    }),
  }
}
