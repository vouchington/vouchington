import type { Context } from '@jongleberry/api-server'
import type {
  EntityRelationPageCursor,
  EntityRelationResult,
  PublicEntityRelationResult,
} from '@services/entity-relations/query'
import { isUUID } from '@modules/utils'
import type { parseEntityRelationSearchInput } from '@services/entity-relations'

export function encodeEntityRelationCursor(
  relation: {
    id: string
    object_id?: string
    created_at: Date
    cursor_created_at: string
    votes_score_sort?: number
    order_index?: number
  },
  scope: string,
  parsed: ReturnType<typeof parseEntityRelationSearchInput>,
): string {
  return Buffer.from(
    JSON.stringify({
      id: relation.object_id ?? relation.id,
      scope,
      sort: parsed.options.sort,
      created_at: relation.cursor_created_at,
      ...(parsed.options.sort === 'best' && parsed.metadata.election
        ? { votes_score_sort: relation.votes_score_sort ?? 0 }
        : {}),
      ...(parsed.options.sort === 'best' && parsed.metadata.order_index
        ? { order_index: relation.order_index ?? 0 }
        : {}),
    }),
  ).toString('base64url')
}

export function parseEntityRelationCursor(
  ctx: Context,
  encoded: string,
  scope: string,
  parsed: ReturnType<typeof parseEntityRelationSearchInput>,
): EntityRelationPageCursor {
  let value: Record<string, unknown>
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
  } catch {
    ctx.throw(400, 'Invalid cursor format')
  }
  ctx.assert(
    value.scope === scope &&
      value.sort === parsed.options.sort &&
      typeof value.id === 'string' &&
      isUUID(value.id),
    400,
    'Invalid cursor format',
  )
  const cursor: EntityRelationPageCursor = { id: value.id as string }
  /* c8 ignore next 4 -- no entity relation currently configures order_index */
  if (parsed.options.sort === 'best' && parsed.metadata.order_index) {
    ctx.assert(Number.isInteger(value.order_index), 400, 'Invalid cursor format')
    cursor.orderIndex = value.order_index as number
  } else {
    ctx.assert(
      typeof value.created_at === 'string' && !Number.isNaN(Date.parse(value.created_at)),
      400,
      'Invalid cursor format',
    )
    cursor.createdAt = value.created_at as string
    if (parsed.options.sort === 'best' && parsed.metadata.election) {
      ctx.assert(typeof value.votes_score_sort === 'number', 400, 'Invalid cursor format')
      cursor.votesScoreSort = value.votes_score_sort as number
    }
  }
  return cursor
}

export function withoutEntityRelationCursorMetadata(
  relation: EntityRelationResult,
): PublicEntityRelationResult {
  const { cursor_created_at: _, ...publicRelation } = relation
  return publicRelation
}
