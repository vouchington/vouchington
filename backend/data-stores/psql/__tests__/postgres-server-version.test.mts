import { describe, expect, it } from 'vitest'
import {
  getReadPoolServerVersionNum,
  getWritePoolServerVersionNum,
} from '../../../test-helpers/data-stores/psql/server-version.mts'

// PostgreSQL 18.4 can return stale UPDATE ... RETURNING OLD values after a concurrent update on a
// table with a BEFORE UPDATE row trigger; PostgreSQL 18.6 (server_version_num 180006) fixes it.
// https://github.com/vouchington/vouchington/issues/6719
const MIN_POSTGRES_SERVER_VERSION_NUM = 180_006

describe('PostgreSQL server version floor', () => {
  it('runs PostgreSQL 18.6 or later on the read and write pools', async () => {
    const [readVersionNum, writeVersionNum] = await Promise.all([
      getReadPoolServerVersionNum(),
      getWritePoolServerVersionNum(),
    ])

    expect(readVersionNum).toBeGreaterThanOrEqual(MIN_POSTGRES_SERVER_VERSION_NUM)
    expect(writeVersionNum).toBeGreaterThanOrEqual(MIN_POSTGRES_SERVER_VERSION_NUM)
  })
})
