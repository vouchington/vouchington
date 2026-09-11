import { read } from '@data-stores/psql'

export function getPsqlReadMockForTest(): typeof read {
  return read
}
