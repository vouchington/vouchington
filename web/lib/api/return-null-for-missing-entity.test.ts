import { describe, expect, it } from 'vitest'
import { ApiError } from './error'
import { returnNullForMissingEntity } from './return-null-for-missing-entity'

describe('returnNullForMissingEntity', () => {
  it('returns null for 404 by default', async () => {
    await expect(
      returnNullForMissingEntity(Promise.reject(new ApiError('Not found', 404))),
    ).resolves.toBeNull()
  })

  it('propagates 403 by default so routes can render forbidden responses', async () => {
    const error = new ApiError('Forbidden', 403)

    await expect(returnNullForMissingEntity(Promise.reject(error))).rejects.toBe(error)
  })

  it('allows callers to explicitly treat 403 as a missing optional entity', async () => {
    await expect(
      returnNullForMissingEntity(Promise.reject(new ApiError('Forbidden', 403)), {
        nullStatusCodes: [403, 404],
      }),
    ).resolves.toBeNull()
  })

  it('propagates non-ApiError exceptions regardless of nullStatusCodes', async () => {
    const error = new Error('Network failure')

    await expect(
      returnNullForMissingEntity(Promise.reject(error), { nullStatusCodes: [403, 404] }),
    ).rejects.toBe(error)
  })
})
