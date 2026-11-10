import { ANCILLARY_SEEDED_ROWS_BY_RELATION } from './plan-ancillary-seeded-rows.mts'
import { CORE_SEEDED_ROWS_BY_RELATION } from './plan-seeded-rows-core.mts'
import { TAIL_SEEDED_ROWS_BY_RELATION } from './plan-seeded-rows-tail.mts'

export const SEEDED_ROWS_BY_RELATION: Readonly<Record<string, number>> = {
  ...CORE_SEEDED_ROWS_BY_RELATION,
  ...TAIL_SEEDED_ROWS_BY_RELATION,
  ...ANCILLARY_SEEDED_ROWS_BY_RELATION,
}
