import { describe, expect, it } from 'vitest'
import { ApiError } from '@vouchington/api-client'
import { getPostImageUpdateFailureMessage } from './image-placement-limit'

describe('getPostImageUpdateFailureMessage', () => {
  it('keeps the saved-post context and gives recovery guidance for placement capacity', () => {
    const error = new ApiError('Image placement limit reached', 409, {
      code: 'IMAGE_PLACEMENT_LIMIT_REACHED',
    })

    expect(getPostImageUpdateFailureMessage(error)).toBe(
      'Post saved, but images failed: This image is already used in many places. Remove it from another profile, topic, community, or post before adding it here.',
    )
  })
})
