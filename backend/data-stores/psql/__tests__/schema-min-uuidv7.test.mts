import { afterAll, describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { readMinimumUuidv7 } from '../../../test-helpers/data-stores/psql/min-uuidv7.mts'
import { onGracefulShutdown } from '../index.mts'

describe('minimum UUIDv7 database helper', () => {
  afterAll(onGracefulShutdown)

  it.each([
    '1970-01-01T00:00:00.000Z',
    '2026-10-08T12:34:56.000Z',
    '2026-10-08T12:34:56.999Z',
    '2026-10-08T12:34:57.000Z',
    '2030-01-01T00:00:00.001Z',
  ])('matches the application minimum UUIDv7 for %s', async timestamp => {
    const at = new Date(timestamp)
    expect(await readMinimumUuidv7(at)).toBe(getMinUUIDv7ForDate(at))
  })
})
