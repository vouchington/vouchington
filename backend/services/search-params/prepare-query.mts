import type { QueryContract, QueryParameterContract } from '@modules/pagination'
import { parseStringArray } from '@ts-shared/utils/query'

/**
 * Converts only documented, well-formed wire values into the generated request-contract shape.
 * Values which cannot be converted deliberately remain untouched so the runtime validator can
 * reject them instead of letting a search parser silently apply its legacy fallback.
 */
export function prepareQueryForValidation(
  query: Record<string, unknown>,
  queryContract: QueryContract,
  ignoredKeys: readonly string[] = [],
): Record<string, unknown> {
  const prepared: Record<string, unknown> = {}
  const ignored = new Set(ignoredKeys)

  for (const [key, value] of Object.entries(query)) {
    const contract = queryContract[key]
    if (!contract || ignored.has(key)) continue
    prepared[key] = prepareValue(value, contract)
  }

  return prepared
}

function prepareValue(value: unknown, contract: QueryParameterContract): unknown {
  switch (contract.kind) {
    case 'boolean':
      return parseWireBoolean(value)
    case 'nullable-boolean':
      // The generated contract deliberately models the HTTP spelling as the string literal
      // `null`; the parser converts it to the service-layer null filter after validation.
      return typeof value === 'string' && value.toLowerCase() === 'null'
        ? 'null'
        : parseWireBoolean(value)
    case 'integer':
      return parseWireNumber(value, Number.isInteger)
    case 'number':
      return parseWireNumber(value, Number.isFinite)
    case 'csv-array':
      return prepareCsvArray(value)
    default:
      return value
  }
}

function parseWireBoolean(value: unknown): unknown {
  if (value === true || value === false) return value
  if (typeof value !== 'string') return value
  if (value === '1' || value.toLowerCase() === 'true') return true
  if (value === '0' || value.toLowerCase() === 'false') return false
  return value
}

function parseWireNumber(value: unknown, predicate: (value: number) => boolean): unknown {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || value.trim() === '') return value
  const parsed = Number(value)
  return predicate(parsed) ? parsed : value
}

function prepareCsvArray(value: unknown): unknown {
  if (typeof value === 'string') return parseStringArray(value)
  // Repeated query values are already an array. Do not CSV-split their elements.
  return value
}
