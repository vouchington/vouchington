import { getMinUUIDv7ForParentHistory, mintUUIDv7 } from '@modules/utils'
import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown, read } from '../index.mts'

describe('fn_min_child_uuidv7', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('matches getMinUUIDv7ForParentHistory for UUIDv7, near-epoch and non-v7 parents', async () => {
    const parents = [
      mintUUIDv7(),
      '00000000-0001-7000-8000-000000000000',
      '4b6f1c1e-8f6e-4b4a-9c1d-2f0e6a7d9b10',
    ]
    const { rows } = await read<{ bound: string }>(
      `/* fnMinChildUuidv7Parity */
      SELECT fn_min_child_uuidv7(parent.id) AS bound
      FROM UNNEST($1::uuid[]) WITH ORDINALITY AS parent(id, position)
      ORDER BY parent.position`,
      [parents],
    )
    expect(rows.map(row => row.bound)).toEqual(parents.map(getMinUUIDv7ForParentHistory))
  })
})
