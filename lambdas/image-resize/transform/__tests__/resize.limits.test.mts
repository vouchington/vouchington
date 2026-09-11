import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { MAX_INPUT_PIXELS } from '../../config.mts'
import { TransformError } from '../../errors.mts'
import { transformImage } from '../resize.mts'

describe('transformImage limits and orientation', () => {
  it('auto-rotates EXIF orientation 6 before resizing', async () => {
    const stored = await sharp({
      create: { width: 100, height: 50, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer()
    const oriented = await sharp(stored).withMetadata({ orientation: 6 }).jpeg().toBuffer()

    const result = await transformImage(oriented, {
      width: 40,
      quality: 75,
      lossless: false,
      progressive: false,
      format: 'jpeg',
    })
    const metadata = await sharp(result).metadata()
    expect(metadata.width).toBe(40)
    expect(metadata.height).toBe(80)
  })

  it('rejects inputs that exceed MAX_INPUT_PIXELS with 413', async () => {
    const overLimitSide = Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 1
    const huge = await sharp({
      create: {
        width: overLimitSide,
        height: overLimitSide,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .jpeg({ quality: 1 })
      .toBuffer()

    const error = await transformImage(huge, {
      width: 100,
      quality: 75,
      lossless: false,
      progressive: false,
      format: 'jpeg',
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TransformError)
    expect((error as TransformError).statusCode).toBe(413)
  })
})
