import type { RecentAutomodAction, RecentAutomodActionSourceType } from './types.mts'

export type RawRecentAutomodAction = Omit<
  RecentAutomodAction,
  'source_key' | 'categories' | 'confidence_score' | 'action_at'
> & {
  source_key: string
  categories: unknown
  confidence_score: string | number | null
  action_at: Date | string
  total_count?: string | number | null
  false_positive_count?: string | number | null
}

export type RecentAutomodActionsCursor = {
  confidenceScore: number | null
  actionAt: string
  sourceKey: string
}

export function parseAutomodActionSourceKey(
  sourceKey: string,
): { sourceType: RecentAutomodActionSourceType; id: string; inputSha256: Buffer | null } | null {
  const [sourceType, id, inputSha256Hex] = sourceKey.split(':')
  if (!id || !isRecentAutomodActionSourceType(sourceType)) return null
  if (!isUuid(id)) return null
  if (sourceType === 'openai_omni' || sourceType === 'spam_detection') {
    if (!inputSha256Hex || !/^[a-f0-9]{64}$/i.test(inputSha256Hex)) return null
    return { sourceType, id, inputSha256: Buffer.from(inputSha256Hex, 'hex') }
  }
  if (inputSha256Hex) return null
  return { sourceType, id, inputSha256: null }
}

export function normalizeRecentAction(row: RawRecentAutomodAction): RecentAutomodAction {
  const { total_count: _total, false_positive_count: _fp, ...action } = row
  return {
    ...action,
    source_type: action.source_type,
    current_state: action.current_state,
    action_at: action.action_at instanceof Date ? action.action_at : new Date(action.action_at),
    confidence_score:
      action.confidence_score === null || Number.isNaN(Number(action.confidence_score))
        ? null
        : Number(action.confidence_score),
    categories: Array.isArray(action.categories)
      ? action.categories.filter((value): value is string => typeof value === 'string')
      : [],
  }
}

export function encodeRecentAutomodActionsCursor(row: RawRecentAutomodAction): string {
  const actionAt = row.action_at instanceof Date ? row.action_at.toISOString() : row.action_at
  return Buffer.from(
    JSON.stringify({
      c:
        row.confidence_score === null || Number.isNaN(Number(row.confidence_score))
          ? null
          : Number(row.confidence_score),
      a: actionAt,
      k: row.source_key,
    }),
  ).toString('base64url')
}

export function decodeRecentAutomodActionsCursor(value: string): RecentAutomodActionsCursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      a?: unknown
      c?: unknown
      k?: unknown
    }
    if (typeof decoded.a !== 'string' || typeof decoded.k !== 'string') return null
    const actionAt = new Date(decoded.a)
    if (Number.isNaN(actionAt.getTime())) return null
    const confidenceScore =
      decoded.c === null
        ? null
        : typeof decoded.c === 'number' && Number.isFinite(decoded.c)
          ? decoded.c
          : null
    return {
      confidenceScore,
      actionAt: actionAt.toISOString(),
      sourceKey: decoded.k,
    }
  } catch {
    return null
  }
}

function isRecentAutomodActionSourceType(
  value: string | undefined,
): value is RecentAutomodActionSourceType {
  return (
    value === 'agent_moderation' ||
    value === 'openai_omni' ||
    value === 'spam_detection' ||
    value === 'community_prompt'
  )
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
