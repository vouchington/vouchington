import { it, expect, describe } from 'vitest'
import { SUPPORTED_IMAGE_FORMATS } from './constants.mts'

describe('constants.generated', () => {
  it('defines the supported upload formats', () => {
    expect(SUPPORTED_IMAGE_FORMATS).toEqual([
      'jpeg',
      'jpg',
      'png',
      'webp',
      'gif',
      'tiff',
      'avif',
      'heif',
      'heic',
    ])
  })
})
