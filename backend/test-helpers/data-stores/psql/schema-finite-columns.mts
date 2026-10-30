import { EXISTING_FINITE_VALUES_1 } from '../../../data-stores/psql/finite-values/existing-1.mts'
import { EXISTING_FINITE_VALUES_2 } from '../../../data-stores/psql/finite-values/existing-2.mts'
import { EXISTING_FINITE_VALUES_3 } from '../../../data-stores/psql/finite-values/existing-3.mts'
import { EXISTING_FINITE_VALUES_4 } from '../../../data-stores/psql/finite-values/existing-4.mts'
import { EXISTING_FINITE_VALUES_5 } from '../../../data-stores/psql/finite-values/existing-5.mts'
import { GENERATED_FINITE_VALUES } from '../../../data-stores/psql/finite-values/index.mts'
import { FINITE_COLUMN_CONTRACTS_1 } from './schema-finite-columns-1.mts'
import { FINITE_COLUMN_CONTRACTS_2 } from './schema-finite-columns-2.mts'
import { FINITE_COLUMN_CONTRACTS_3 } from './schema-finite-columns-3.mts'
import { FINITE_COLUMN_CONTRACTS_4 } from './schema-finite-columns-4.mts'
import { FINITE_COLUMN_CONTRACTS_5 } from './schema-finite-columns-5.mts'
import { FINITE_COLUMN_CONTRACTS_6 } from './schema-finite-columns-6.mts'
import { FINITE_COLUMN_CONTRACTS_7 } from './schema-finite-columns-7.mts'

const FINITE_VALUES = {
  ...GENERATED_FINITE_VALUES,
  ...EXISTING_FINITE_VALUES_1,
  ...EXISTING_FINITE_VALUES_2,
  ...EXISTING_FINITE_VALUES_3,
  ...EXISTING_FINITE_VALUES_4,
  ...EXISTING_FINITE_VALUES_5,
}

export const CONVERTED_FINITE_COLUMNS = [
  ...FINITE_COLUMN_CONTRACTS_1,
  ...FINITE_COLUMN_CONTRACTS_2,
  ...FINITE_COLUMN_CONTRACTS_3,
  ...FINITE_COLUMN_CONTRACTS_4,
  ...FINITE_COLUMN_CONTRACTS_5,
  ...FINITE_COLUMN_CONTRACTS_6,
  ...FINITE_COLUMN_CONTRACTS_7,
].map(([table, column, type, isArray]) => ({
  table,
  column,
  type,
  isArray,
  labels: FINITE_VALUES[type],
}))
