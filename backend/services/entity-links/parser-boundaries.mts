import type { EntityMention } from './types.mts'

export function hasValidLeftBoundary(text: string, startIndex: number): boolean {
  if (startIndex === 0) return true
  const previous = text[startIndex - 1]!
  return !/[A-Za-z0-9_./@#!-]/.test(previous)
}

export function hasValidRightBoundary(
  text: string,
  endIndex: number,
  type: EntityMention['type'],
): boolean {
  const next = text[endIndex]
  if (!next) return true

  if (type === 'user') return hasValidUserRightBoundary(text, endIndex)
  if (type === 'topic') return hasValidTopicRightBoundary(text, endIndex)
  return hasValidPostRightBoundary(text, endIndex)
}

function hasValidUserRightBoundary(text: string, endIndex: number): boolean {
  const next = text[endIndex]!
  if (next === '/' || next === '@') return false
  if (next === '.' && /[A-Za-z0-9]/.test(text[endIndex + 1] ?? '')) return false
  return !/[A-Za-z0-9_-]/.test(next)
}

function hasValidTopicRightBoundary(text: string, endIndex: number): boolean {
  const next = text[endIndex]!
  if (next === '/' || next === '#' || next === '_') return false
  if (next === '.' && /[A-Za-z0-9]/.test(text[endIndex + 1] ?? '')) return false
  return !/[A-Za-z0-9-]/.test(next)
}

function hasValidPostRightBoundary(text: string, endIndex: number): boolean {
  const next = text[endIndex]!
  if (next === '!' || next === '/' || next === '@' || next === '_') return false
  if (next === '.' && /[A-Za-z0-9]/.test(text[endIndex + 1] ?? '')) return false
  return true
}
