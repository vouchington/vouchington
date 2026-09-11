import {
  ImageInputPixelLimitError,
  ImageTransformError,
  transformImage as transformImageBytes,
  transformImageToFile,
} from '@vouchington/image-resize'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_INPUT_PIXELS } from '../config.mts'
import { TransformError } from '../errors.mts'
import type { TempImageFile } from '../temp-file.mts'
import type { TransformOptions } from './options.mts'

export async function transformImage(input: Buffer, options: TransformOptions): Promise<Buffer> {
  try {
    return await transformImageBytes(input, toPublicOptions(options))
  } catch (error: unknown) {
    throw mapTransformError(error)
  }
}

export async function transformImageFile(
  input: TempImageFile,
  options: TransformOptions,
): Promise<TempImageFile> {
  const directory = await mkdtemp(join(tmpdir(), 'voucha-image-resize-'))
  const path = join(directory, 'rendered-image')
  try {
    await transformImageToFile(input.path, path, toPublicOptions(options))
    return {
      path,
      cleanup: async () => rm(directory, { recursive: true, force: true }),
    }
  } catch (error: unknown) {
    await rm(directory, { recursive: true, force: true })
    throw mapTransformError(error)
  }
}

function toPublicOptions(options: TransformOptions) {
  return { ...options, maxInputPixels: MAX_INPUT_PIXELS }
}

function mapTransformError(error: unknown): TransformError {
  const statusCode = error instanceof ImageInputPixelLimitError ? 413 : 500
  const cause = error instanceof ImageTransformError ? error.cause : error
  const message = cause instanceof Error ? cause.message : 'Unknown error'
  return new TransformError(`Image transformation failed: ${message}`, statusCode)
}
