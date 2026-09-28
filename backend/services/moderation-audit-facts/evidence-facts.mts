const KNOWN_KEYS = new Set([
  'platform_override',
  'flagged_categories',
  'composite_score',
  'signals',
  'error_code',
])

export type DispositionEvidenceFacts = {
  platformOverride: boolean
  compositeScore: number | null
  errorCode: string | null
  categories: string[]
  signals: Array<{ signal: string; score: number; flagged: boolean }>
}

export function dispositionEvidenceFacts(
  evidence: Readonly<Record<string, unknown>> | undefined,
): DispositionEvidenceFacts {
  const value = evidence ?? {}
  for (const key of Object.keys(value)) {
    if (!KNOWN_KEYS.has(key)) throw new Error(`Unknown moderation evidence key: ${key}`)
  }
  const categories = Array.isArray(value.flagged_categories)
    ? value.flagged_categories.filter((item): item is string => typeof item === 'string')
    : []
  if (value.flagged_categories != null && !Array.isArray(value.flagged_categories)) {
    throw new Error('Invalid moderation evidence: flagged_categories')
  }
  return {
    platformOverride: value.platform_override === true,
    compositeScore: numberValue(value.composite_score),
    errorCode: textValue(value.error_code),
    categories,
    signals: signalList(value.signals).slice(0, 100),
  }
}

function numberValue(value: unknown): number | null {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Invalid moderation evidence: composite_score')
  }
  return value
}

function textValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Invalid moderation evidence: error_code')
  }
  return value
}

function signalList(value: unknown): Array<{ signal: string; score: number; flagged: boolean }> {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error('Invalid moderation evidence: signals')
  return value.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid moderation evidence signal')
    const signal = item as { signal?: unknown; score?: unknown; flagged?: unknown }
    if (typeof signal.signal !== 'string' || signal.signal.length === 0) {
      throw new Error('Invalid moderation evidence signal')
    }
    if (typeof signal.score !== 'number' || !Number.isFinite(signal.score)) {
      throw new Error('Invalid moderation evidence signal')
    }
    if (typeof signal.flagged !== 'boolean') throw new Error('Invalid moderation evidence signal')
    return { signal: signal.signal, score: signal.score, flagged: signal.flagged }
  })
}
