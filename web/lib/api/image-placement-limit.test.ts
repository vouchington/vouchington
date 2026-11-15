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
  it('uses translated post capacity guidance for an image update rejection', () => {
    const error = new ApiError('capacity', 409, { code: 'POST_IMAGE_LIMIT_REACHED' })
    expect(
      getPostImageUpdateFailureMessage(
        error,
        'Votre publication a été enregistrée, mais ses images n’ont pas pu être mises à jour.',
      ),
    ).toBe('Votre publication a été enregistrée, mais ses images n’ont pas pu être mises à jour.')
  })
})
