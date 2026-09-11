import { describe, it, expect, beforeAll } from 'vitest'

import sharp from 'sharp'

import { transformImage } from '../resize.mts'

import { TransformError } from '../../errors.mts'

describe('transformImage', () => {
  let rgbImage: Buffer

  let grayscaleImage: Buffer

  let alphaImage: Buffer

  let largeImage: Buffer

  let smallImage: Buffer

  beforeAll(async () => {
    // Create a 100x100 RGB image
    rgbImage = await sharp(Buffer.alloc(100 * 100 * 3, 255), {
      raw: {
        width: 100,
        height: 100,
        channels: 3,
      },
    })
      .jpeg()
      .toBuffer()

    // Create a 100x100 grayscale image
    grayscaleImage = await sharp(Buffer.alloc(100 * 100, 128), {
      raw: {
        width: 100,
        height: 100,
        channels: 1,
      },
    })
      .toColorspace('b-w')
      .png()
      .toBuffer()

    // Create a 100x100 RGBA image with alpha
    const alphaBuffer = Buffer.alloc(100 * 100 * 4)
    for (let i = 0; i < alphaBuffer.length; i += 4) {
      alphaBuffer[i] = 255 // R
      alphaBuffer[i + 1] = 0 // G
      alphaBuffer[i + 2] = 0 // B
      alphaBuffer[i + 3] = 128 // A (50%)
    }
    alphaImage = await sharp(alphaBuffer, {
      raw: {
        width: 100,
        height: 100,
        channels: 4,
      },
    })
      .png()
      .toBuffer()

    // Create a 1000x1000 image for downscaling tests
    largeImage = await sharp(Buffer.alloc(1000 * 1000 * 3, 255), {
      raw: {
        width: 1000,
        height: 1000,
        channels: 3,
      },
    })
      .jpeg()
      .toBuffer()

    // Create a 50x50 image for upscaling prevention tests
    smallImage = await sharp(Buffer.alloc(50 * 50 * 3, 255), {
      raw: {
        width: 50,
        height: 50,
        channels: 3,
      },
    })
      .jpeg()
      .toBuffer()
  })

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
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof rgbImage)
  void (0 as unknown as typeof grayscaleImage)
  void (0 as unknown as typeof alphaImage)
  void (0 as unknown as typeof largeImage)
  void (0 as unknown as typeof smallImage)
})
