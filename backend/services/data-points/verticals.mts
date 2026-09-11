import type { DataPointVertical } from './types.mts'
import { DATA_POINT_VERTICALS } from '@ts-shared/data-points'

const VALID_VERTICALS = new Set(DATA_POINT_VERTICALS.map(o => o.value))

export function isValidVertical(v: unknown): v is DataPointVertical {
  return typeof v === 'string' && VALID_VERTICALS.has(v)
}
