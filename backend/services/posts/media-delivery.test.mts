import { describe, expect, it } from 'vitest'
import { preparePostImageDeliveryMutation } from './media-delivery.mts'

describe('preparePostImageDeliveryMutation', () => {
  it('returns without locking when edge enforcement is disabled', async () => {
    await expect(
      preparePostImageDeliveryMutation(
        {
          async query() {
            throw new Error('post image delivery must not query when enforcement is off')
          },
        } as never,
        { imageIds: ['00000000-0000-7000-8000-000000000001'] },
      ),
    ).resolves.toBeUndefined()
  })
})
