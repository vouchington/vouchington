import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { buildPageInfo, decodeCursor } from '@modules/pagination'
import createHttpError from 'http-errors'
import type { PageInfo } from '@voucha/types/pagination'
import type { SupportThreadWithStatus } from './types.mts'

const SUPPORT_THREAD_CURSOR_SCOPE_VERSION = 'v1'
const SUPPORT_THREAD_CURSOR_SORT = 'unresolved-asc-service-level-desc-id-desc'

export async function searchSupportThreads(options?: {
  status?: 'open' | 'assigned' | 'resolved'
  q?: string
  limit?: number
  after?: string
}): Promise<{ results: SupportThreadWithStatus[]; page_info: PageInfo }> {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100)
  const normalizedOptions = {
    q: normalizeSearchQuery(options?.q),
    status: options?.status,
  }
  const cursorScope = getSupportThreadCursorScope(normalizedOptions)
  const after = options?.after ? decodeSupportThreadCursor(options.after, cursorScope) : null
  const query = sql`/* searchSupportThreads */
    WITH ranked_threads AS (
      SELECT
        st.id, st.support_contact_id, st.subject, st.conversation_id, st.created_at, st.updated_at,
        st.assigned_at, st.assigned_to_id, st.resolved_at, st.resolved_by_id,
        CASE WHEN st.resolved_at IS NOT NULL THEN 'resolved' WHEN st.assigned_at IS NOT NULL THEN 'assigned' ELSE 'open' END AS status,
        CASE WHEN st.resolved_at IS NULL THEN 0 ELSE 1 END AS unresolved_sort,
        CASE WHEN st.resolved_at IS NOT NULL THEN 0 WHEN membership.plan = 'pro' THEN 2 WHEN membership.plan = 'plus' THEN 1 ELSE 0 END AS service_level
      FROM support_threads st
      JOIN support_contacts sc ON sc.id = st.support_contact_id
      LEFT JOIN view_current_paid_memberships membership ON membership.user_id = sc.user_id
      WHERE 1=1
  `
  appendSearchFilters(query, normalizedOptions)
  query.append(sql`) SELECT id, support_contact_id, subject, conversation_id, created_at, updated_at,
    assigned_at, assigned_to_id, resolved_at, resolved_by_id, status, service_level FROM ranked_threads`)
  if (after) {
    query.append(sql` WHERE ranked_threads.id <> ${after.id} AND (
      ranked_threads.unresolved_sort > ${after.unresolved_sort}
      OR (
        ranked_threads.unresolved_sort = ${after.unresolved_sort}
        AND ranked_threads.service_level < ${after.service_level}
      )
      OR (
        ranked_threads.unresolved_sort = ${after.unresolved_sort}
        AND ranked_threads.service_level = ${after.service_level}
        AND ranked_threads.id < ${after.id}
      )
    )`)
  }
  query.append(sql` ORDER BY unresolved_sort ASC, service_level DESC, id DESC LIMIT ${limit + 1}`)
  const threads = (await read(query)).rows as RankedSupportThread[]
  const hasNextPage = threads.length > limit
  const pageRows = hasNextPage ? threads.slice(0, limit) : threads
  const results = pageRows.map(({ service_level: _serviceLevel, ...thread }) => thread)
  return {
    results,
    page_info: buildPageInfo(pageRows, {
      hasNextPage,
      getCursor: item => ({
        id: item.id,
        unresolved_sort: item.status === 'resolved' ? 1 : 0,
        service_level: item.status === 'resolved' ? 0 : item.service_level,
        scope: cursorScope,
      }),
    }),
  }
}

type RankedSupportThread = SupportThreadWithStatus & { service_level: 0 | 1 | 2 }

type SupportThreadCursor = {
  id: string
  unresolved_sort: 0 | 1
  service_level: 0 | 1 | 2
  scope: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function decodeSupportThreadCursor(encoded: string, expectedScope: string): SupportThreadCursor {
  let cursor: Record<string, unknown>
  try {
    cursor = decodeCursor(encoded) as Record<string, unknown>
  } catch (error) {
    throw createHttpError(400, 'Invalid cursor format', { cause: error })
  }
  const fields = cursor as Record<string, unknown>
  if (
    typeof fields.id !== 'string' ||
    !UUID_RE.test(fields.id) ||
    (fields.unresolved_sort !== 0 && fields.unresolved_sort !== 1) ||
    (fields.service_level !== 0 && fields.service_level !== 1 && fields.service_level !== 2) ||
    fields.scope !== expectedScope ||
    Object.keys(fields).length !== 4
  )
    throw createHttpError(400, 'Invalid cursor format')
  return cursor as SupportThreadCursor
}

function getSupportThreadCursorScope(options: {
  q?: string
  status?: 'open' | 'assigned' | 'resolved'
}): string {
  return JSON.stringify({
    resource: 'support-threads',
    version: SUPPORT_THREAD_CURSOR_SCOPE_VERSION,
    sort: SUPPORT_THREAD_CURSOR_SORT,
    status: options.status ?? null,
    q: options.q ?? null,
  })
}

function normalizeSearchQuery(query: string | undefined): string | undefined {
  const normalized = query?.trim().replaceAll(/\s+/g, ' ').toLowerCase()
  return normalized || undefined
}

function appendSearchFilters(
  query: ReturnType<typeof sql>,
  options: { q?: string; status?: 'open' | 'assigned' | 'resolved' },
): void {
  if (options?.status === 'resolved') query.append(sql` AND st.resolved_at IS NOT NULL`)
  else if (options?.status === 'assigned')
    query.append(sql` AND st.assigned_at IS NOT NULL AND st.resolved_at IS NULL`)
  else if (options?.status === 'open')
    query.append(sql` AND st.assigned_at IS NULL AND st.resolved_at IS NULL`)
  if (options?.q)
    query.append(
      sql` AND (sc.email_address ILIKE '%' || ${options.q} || '%' OR st.subject ILIKE '%' || ${options.q} || '%')`,
    )
}
