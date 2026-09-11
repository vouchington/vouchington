import { describe, it, expect } from 'vitest'
import { MIME_TYPES } from './s3.mts'
import { SUPPORTED_IMAGE_FORMATS } from './constants.mts'

describe('MIME_TYPES', () => {
  const cases: Array<[string, string]> = [
    ['jpeg', 'image/jpeg'],
    ['jpg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
    ['avif', 'image/avif'],
    ['gif', 'image/gif'],
    ['tiff', 'image/tiff'],
    ['tif', 'image/tiff'],
    ['svg', 'image/svg+xml'],
    ['heif', 'image/heif'],
    ['heic', 'image/heic'],
    ['jp2', 'image/jp2'],
    ['jxl', 'image/jxl'],
  ]

  for (const [format, expected] of cases) {
    it(`maps "${format}" → "${expected}"`, () => {
      expect(MIME_TYPES[format]).toBe(expected)
    })
  }

  it('covers all SUPPORTED_IMAGE_FORMATS', () => {
    for (const format of SUPPORTED_IMAGE_FORMATS) {
      expect(MIME_TYPES[format]).toBeDefined()
    }
  })
})
