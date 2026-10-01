import { createResizeTestImages } from '../../../test-helpers/image-resize/resize-images.mts'
import { describe, it, expect, beforeAll } from 'vitest'

import sharp from 'sharp'

import { transformImage } from '../resize.mts'

describe('transformImage', () => {
  let rgbImage: Buffer
  let largeImage: Buffer

  beforeAll(async () => {
    ;({ rgbImage, largeImage } = await createResizeTestImages(
      async (pixels, raw, format, grayscale) => {
        const image = sharp(pixels, { raw })
        if (grayscale) image.toColorspace('b-w')
        return image.toFormat(format).toBuffer()
      },
    ))
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
})
