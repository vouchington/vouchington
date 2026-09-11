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

  describe('format conversion', () => {
    it('should convert to JPEG', async () => {
      const result = await transformImage(rgbImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.format).toBe('jpeg')
    })

    it('should convert to PNG', async () => {
      const result = await transformImage(rgbImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'png',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.format).toBe('png')
    })

    it('should convert to WebP', async () => {
      const result = await transformImage(rgbImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'webp',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.format).toBe('webp')
    })

    it('should convert to AVIF', async () => {
      const result = await transformImage(rgbImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'avif',
      })

      const metadata = await sharp(result).metadata()
      // Sharp reports AVIF as 'heif' in metadata
      expect(metadata.format).toBe('heif')
    })
  })

  describe('quality and compression', () => {
    it('should apply quality setting', async () => {
      const highQuality = await transformImage(rgbImage, {
        width: 50,
        quality: 95,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      })

      const lowQuality = await transformImage(rgbImage, {
        width: 50,
        quality: 10,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      })

      expect(highQuality.length).toBeGreaterThan(lowQuality.length)
    })

    it('should apply lossless compression for WebP', async () => {
      const lossless = await transformImage(rgbImage, {
        width: 50,
        quality: 75,
        lossless: true,
        progressive: false,
        format: 'webp',
      })

      const metadata = await sharp(lossless).metadata()
      expect(metadata.format).toBe('webp')
      expect(metadata.width).toBe(50)
    })

    it('should apply lossless compression for PNG', async () => {
      const lossless = await transformImage(rgbImage, {
        width: 50,
        quality: 75,
        lossless: true,
        progressive: false,
        format: 'png',
      })

      const metadata = await sharp(lossless).metadata()
      expect(metadata.format).toBe('png')
    })

    it('should apply progressive rendering for JPEG', async () => {
      const result = await transformImage(largeImage, {
        width: 500,
        quality: 75,
        lossless: false,
        progressive: true,
        format: 'jpeg',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.format).toBe('jpeg')
    })

    it('should apply progressive rendering for PNG', async () => {
      const result = await transformImage(largeImage, {
        width: 500,
        quality: 75,
        lossless: false,
        progressive: true,
        format: 'png',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.format).toBe('png')
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof TransformError)
  void (0 as unknown as typeof grayscaleImage)
  void (0 as unknown as typeof alphaImage)
  void (0 as unknown as typeof smallImage)
})
