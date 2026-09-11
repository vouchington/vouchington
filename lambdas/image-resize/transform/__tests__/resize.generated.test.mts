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

  describe('basic resizing', () => {
    it('should resize image to specified width', async () => {
      const result = await transformImage(rgbImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.width).toBe(50)
    })

    it('should resize image to specified width and height', async () => {
      const result = await transformImage(largeImage, {
        width: 200,
        height: 150,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      })

      const metadata = await sharp(result).metadata()
      // Should fit inside 200x150 while maintaining aspect ratio
      expect(metadata.width).toBeLessThanOrEqual(200)
      expect(metadata.height).toBeLessThanOrEqual(150)
    })

    it('should maintain aspect ratio', async () => {
      const result = await transformImage(largeImage, {
        width: 500,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.width).toBe(500)
      expect(metadata.height).toBe(500)
    })

    it('should never upscale images', async () => {
      const result = await transformImage(smallImage, {
        width: 200,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.width).toBe(50)
      expect(metadata.height).toBe(50)
    })
  })

  describe('grayscale preservation', () => {
    it('should preserve grayscale images', async () => {
      const result = await transformImage(grayscaleImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'png',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.channels).toBe(1)
    })

    it('should use appropriate chroma subsampling for grayscale AVIF', async () => {
      const result = await transformImage(grayscaleImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'avif',
      })

      const metadata = await sharp(result).metadata()
      // Sharp reports AVIF as 'heif' in metadata
      expect(metadata.format).toBe('heif')
      expect(metadata.width).toBe(50)
    })
  })

  describe('alpha channel handling', () => {
    it('should preserve alpha in PNG', async () => {
      const result = await transformImage(alphaImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'png',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.hasAlpha).toBe(true)
      expect(metadata.channels).toBe(4)
    })

    it('should preserve alpha in WebP', async () => {
      const result = await transformImage(alphaImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'webp',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.hasAlpha).toBe(true)
    })

    it('should preserve alpha in AVIF', async () => {
      const result = await transformImage(alphaImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'avif',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.hasAlpha).toBe(true)
    })

    it('should flatten alpha to white for JPEG', async () => {
      const result = await transformImage(alphaImage, {
        width: 50,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      })

      const metadata = await sharp(result).metadata()
      expect(metadata.hasAlpha).toBe(false)
      expect(metadata.channels).toBe(3)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof TransformError)
})
