import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  insertTestDataPoint,
  readStoredDataPointCounts,
} from '../../../test-helpers/entities/data-points.mts'
import { createTestUser } from '../../../test-helpers/entities/users.mts'
import { onGracefulShutdown } from '../index.mts'

const ABOVE_INT32_MAX = 2147483648

describe('post data point count storage', () => {
  afterAll(onGracefulShutdown)

  it('stores inquiry and card counts above the 32-bit integer maximum', async () => {
    const user = await createTestUser()
    const suffix = randomUUID().slice(0, 8)
    const postId = await insertTestDataPoint({
      title: `Count range ${suffix}`,
      slug: `count-range-${suffix}`,
      createdById: user.id,
      hardInquiries12m: ABOVE_INT32_MAX,
      cardsOpened24m: ABOVE_INT32_MAX,
    })

    expect(await readStoredDataPointCounts(postId)).toEqual({
      hardInquiries12m: ABOVE_INT32_MAX,
      cardsOpened24m: ABOVE_INT32_MAX,
    })
  })
})
