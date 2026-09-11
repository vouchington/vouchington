import type { Context } from '@jongleberry/api-server'
import {
  MODERATION_REPORT_ENTITY_TYPES,
  MODERATION_REPORT_STATUSES,
  type ModerationReportSort,
  type ModerationReportStatus,
} from '@services/moderation-reports'
import { hasExactKeys, isPreciseTimestampString } from '@modules/pagination'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ReportCursorCommon = {
  id: string
  sort: ModerationReportSort
  status: ModerationReportStatus
  scope: string
}

export type ParsedReportCursor =
  | (ReportCursorCommon & {
      cluster: false
      reportCount?: number
      severityRank?: number
    })
  | (ReportCursorCommon & {
      cluster: true
      createdAt: string
      entityType: string
    })

export function parseReportCursor(ctx: Context, value: string): ParsedReportCursor {
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
  } catch {
    ctx.throw(422, 'Invalid cursor')
  }
  ctx.assert(isReportCursor(decoded), 422, 'Invalid cursor')
  if (decoded.cluster) {
    return {
      cluster: true,
      createdAt: decoded.created_at,
      entityType: decoded.entity_type,
      id: decoded.id,
      sort: decoded.sort,
      status: decoded.status,
      scope: decoded.scope,
    }
  }
  return {
    cluster: false,
    id: decoded.id,
    sort: decoded.sort,
    reportCount: decoded.report_count,
    severityRank: decoded.severity_rank,
    status: decoded.status,
    scope: decoded.scope,
  }
}

type EncodedFlatReportCursor = {
  cluster: false
  id: string
  report_count?: number
  severity_rank?: number
  sort: ModerationReportSort
  status: ModerationReportStatus
  scope: string
}

type EncodedClusterReportCursor = {
  cluster: true
  created_at: string
  entity_type: string
  id: string
  sort: 'created_at_asc' | 'created_at_desc'
  status: ModerationReportStatus
  scope: string
}

function isReportCursor(
  value: unknown,
): value is EncodedFlatReportCursor | EncodedClusterReportCursor {
  if (!isCommonCursor(value)) return false
  if (value.cluster === true) return isClusterCursor(value)
  if (value.cluster !== false) return false
  return isFlatCursor(value)
}

function isCommonCursor(value: unknown): value is Record<string, unknown> & ReportCursorCommon {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const cursor = value as Record<string, unknown>
  return (
    typeof cursor.id === 'string' &&
    uuidRegex.test(cursor.id) &&
    typeof cursor.scope === 'string' &&
    (cursor.sort === 'severity' ||
      cursor.sort === 'most_reported' ||
      cursor.sort === 'created_at_asc' ||
      cursor.sort === 'created_at_desc') &&
    typeof cursor.status === 'string' &&
    (MODERATION_REPORT_STATUSES as readonly string[]).includes(cursor.status)
  )
}

function isClusterCursor(value: Record<string, unknown>): value is EncodedClusterReportCursor {
  return (
    hasExactKeys(value, [
      'cluster',
      'created_at',
      'entity_type',
      'id',
      'sort',
      'status',
      'scope',
    ]) &&
    (value.sort === 'created_at_asc' || value.sort === 'created_at_desc') &&
    typeof value.created_at === 'string' &&
    isPreciseTimestampString(value.created_at) &&
    typeof value.entity_type === 'string' &&
    (MODERATION_REPORT_ENTITY_TYPES as readonly string[]).includes(value.entity_type)
  )
}

function isFlatCursor(value: Record<string, unknown>): value is EncodedFlatReportCursor {
  const sortFields =
    value.sort === 'severity'
      ? ['report_count', 'severity_rank']
      : value.sort === 'most_reported'
        ? ['report_count']
        : []
  if (!hasExactKeys(value, ['cluster', 'id', 'sort', 'status', 'scope', ...sortFields])) {
    return false
  }
  if (
    'report_count' in value &&
    !(typeof value.report_count === 'number' && Number.isInteger(value.report_count))
  ) {
    return false
  }
  return (
    !('severity_rank' in value) ||
    (typeof value.severity_rank === 'number' && Number.isInteger(value.severity_rank))
  )
}

export function reportCursorScope(audience: 'staff' | 'member', ownerId: string | null): string {
  return JSON.stringify({ audience, ownerId })
}
