import type { TopicRevisionChanges } from './facts.mts'

const TEXT_FIELDS = ['name', 'slug', 'markdown'] as const
const UUID_FIELDS = [
  'logo_image_id',
  'hero_image_id',
  'homepage_url_id',
  'hostname_id',
  'rewards_program_id',
  'referral_program_id',
] as const

type TextPair = { changed: boolean; before: string | null; after: string | null }

export function textPair(
  changes: TopicRevisionChanges,
  field: (typeof TEXT_FIELDS)[number],
): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return { changed: true, before: asText(change.before, field), after: asText(change.after, field) }
}

export function enumPair(
  changes: TopicRevisionChanges,
  field: string,
  allowed: Set<string>,
): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return {
    changed: true,
    before: asEnum(change.before, field, allowed),
    after: asEnum(change.after, field, allowed),
  }
}

export function boolPair(
  changes: TopicRevisionChanges,
  field: string,
): {
  changed: boolean
  before: boolean | null
  after: boolean | null
} {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return {
    changed: true,
    before: asBoolean(change.before, field),
    after: asBoolean(change.after, field),
  }
}

export function uuidPair(
  changes: TopicRevisionChanges,
  field: (typeof UUID_FIELDS)[number],
): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return { changed: true, before: asText(change.before, field), after: asText(change.after, field) }
}

export function timePair(
  changes: TopicRevisionChanges,
  field: string,
): {
  changed: boolean
  before: Date | null
  after: Date | null
  beforeSentinel: string | null
  afterSentinel: string | null
} {
  const change = changes[field]
  if (!change) {
    return { changed: false, before: null, after: null, beforeSentinel: null, afterSentinel: null }
  }
  const before = asTimestamp(change.before, field)
  const after = asTimestamp(change.after, field)
  return {
    changed: true,
    before: before.at,
    after: after.at,
    beforeSentinel: before.sentinel,
    afterSentinel: after.sentinel,
  }
}

function asText(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  throw new Error(`Topic revision ${field} must be text or null`)
}

function asEnum(value: unknown, field: string, allowed: Set<string>): string | null {
  if (value === null) return null
  if (typeof value === 'string' && allowed.has(value)) return value
  throw new Error(`Topic revision ${field} has an unknown value`)
}

function asBoolean(value: unknown, field: string): boolean | null {
  if (value === null) return null
  if (typeof value === 'boolean') return value
  throw new Error(`Topic revision ${field} must be boolean or null`)
}

function asTimestamp(value: unknown, field: string): { at: Date | null; sentinel: string | null } {
  if (value === null) return { at: null, sentinel: null }
  if (value === 'now') return { at: null, sentinel: 'now' }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { at: value, sentinel: null }
  throw new Error(`Topic revision ${field} must be a timestamp, now, or null`)
}
