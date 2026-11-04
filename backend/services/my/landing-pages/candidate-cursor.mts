import { decodeUuidCursor, hasExactKeys } from '@modules/pagination'
import assert from 'http-assert'
import type { LandingPageCandidateId } from './candidate-ids.mts'

type CandidateCursor = LandingPageCandidateId & { scope: string }

export function decodeLandingPageCandidateCursor(encoded: string, scope: string): CandidateCursor {
  const message = 'Invalid landing page candidates cursor'
  const cursor = decodeUuidCursor(encoded, isCandidateCursor, message)
  assert(cursor.scope === scope, 400, message)
  return cursor
}

function isCandidateCursor(value: unknown): value is CandidateCursor {
  if (!hasExactKeys(value, ['id', 'tier', 'sort_order', 'scope'])) return false
  if (typeof value.id !== 'string' || typeof value.scope !== 'string') return false
  if (value.tier !== 0 && value.tier !== 1 && value.tier !== 2) return false
  return value.tier === 2
    ? typeof value.sort_order === 'number' && Number.isSafeInteger(value.sort_order)
    : value.sort_order === null
}
