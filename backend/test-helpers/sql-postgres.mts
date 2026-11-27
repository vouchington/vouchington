import { read } from '@data-stores/psql'
import { getPublicBaseTableNamesForTest as getBaseTableNames } from 'vouchington-tooling/postgres-test-faults'

export function getPublicBaseTableNamesForTest(): Promise<Set<string>> {
  return getBaseTableNames(({ text, values }) => read(text, values))
}
