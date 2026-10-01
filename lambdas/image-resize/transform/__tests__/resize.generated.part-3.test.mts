import { describe, it, expect } from 'vitest'

import { transformImage } from '../resize.mts'

import { TransformError } from '../../errors.mts'

describe('transformImage', () => {
  describe('error handling', () => {
    it('should throw TransformError on invalid input', async () => {
      const invalidBuffer = Buffer.from('not an image')

      await expect(
        transformImage(invalidBuffer, {
          width: 50,
          quality: 75,
          lossless: false,
          progressive: false,
          format: 'jpeg',
        }),
      ).rejects.toThrow(TransformError)
    })

    it('should throw TransformError with 500 status code', async () => {
      const invalidBuffer = Buffer.from('not an image')

      const errTransform = await transformImage(invalidBuffer, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      }).catch(e => e)
      expect(errTransform).toBeInstanceOf(TransformError)
      expect(errTransform.statusCode).toBe(500)
    })
  })
})
