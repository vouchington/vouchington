import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { getMinUUIDv7ForParentHistory, mintUuidv7 } from '@modules/utils'
import { afterAll, describe, expect, it } from 'vitest'
import { readMinChildUuidv7Bounds } from '../../../test-helpers/data-stores/psql/min-uuidv7.mts'

describe('fn_min_child_uuidv7', () => {
  afterAll(async () => {
    await onGracefulShutdown('SIGTERM')
  })

  it('matches getMinUUIDv7ForParentHistory for UUIDv7, near-epoch and non-v7 parents', async () => {
    const parents = [
      mintUuidv7(),
      '00000000-0001-7000-8000-000000000000',
      '4b6f1c1e-8f6e-4b4a-9c1d-2f0e6a7d9b10',
    ]
    const bounds = await readMinChildUuidv7Bounds(parents)
    expect(bounds).toEqual(parents.map(getMinUUIDv7ForParentHistory))
  })
})
