import { isUUID } from '@modules/utils'
import { parseStringArray } from '@ts-shared/utils/query'
import createHttpError from 'http-errors'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

export function extractIdentifier(
  query: Record<string, unknown>,
  param: string,
): string | undefined {
  return query[param] ? stringFromUnknown(query[param]) : undefined
}

export function extractIdentifiers(
  query: Record<string, unknown>,
  params: string[],
  max: number,
): string[] {
  const identifiers = params.flatMap(p =>
    parseStringArray(query[p]).map(s => s.trim().toLowerCase()),
  )
  const unique = [...new Set(identifiers)]
  if (unique.length > max) {
    throw createHttpError(422, `Too many ${params[0]} identifiers (max ${max})`)
  }
  return unique
}

export function extractRssFeedItemId(
  query: Record<string, unknown>,
  param: string,
): string | undefined {
  const value = query[param] ? stringFromUnknown(query[param]).trim() : undefined
  if (value !== undefined && !isUUID(value)) {
    throw createHttpError(422, 'similar_rss_feed_item must be a valid UUID')
  }
  return value
}

export function checkShouldReturnEmpty(
  singles: Array<{ identifier: string | undefined; resolved: string | null | undefined }>,
  multis: Array<{ identifiers: string[]; resolved: (string | null)[] }>,
): boolean {
  for (const { identifier, resolved } of singles) {
    if (identifier !== undefined && !resolved) return true
  }
  for (const { identifiers, resolved } of multis) {
    if (identifiers.length > 0 && resolved.some(id => !id)) return true
  }
  return false
}
