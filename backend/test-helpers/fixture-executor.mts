import { read as readQuery, write as writeQuery } from '@data-stores/psql'

import { allowFixtureQuery } from './fixture-sql.mts'

export const read: typeof readQuery = (input, valuesOrOptions, options) =>
  readQuery(allowFixtureQuery(input), valuesOrOptions, options)

export const write: typeof writeQuery = (input, valuesOrOptions, options) =>
  writeQuery(allowFixtureQuery(input), valuesOrOptions, options)
