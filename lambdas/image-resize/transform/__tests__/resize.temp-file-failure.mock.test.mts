import { access } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { TempImageFile } from '../../temp-file.mts'
import { TransformError } from '../../errors.mts'

const mockTransformImageToFile = vi.hoisted(() =>
  vi.fn<typeof import('@vouchington/image-resize').transformImageToFile>(async () => {
    throw new Error('write failed')
  }),
)

vi.mock<typeof import('@vouchington/image-resize')>(
  import('@vouchington/image-resize'),
  async () => ({
    ...(await vi.importActual<typeof import('@vouchington/image-resize')>(
      '@vouchington/image-resize',
    )),
    transformImageToFile: mockTransformImageToFile,
  }),
)

const { transformImageFile } = await import('../resize.mts')

describe('transformImageFile cleanup', () => {
  it('cleans its output directory when writing the transformed file fails', async () => {
    const input: TempImageFile = { path: '/unused/input', cleanup: async () => undefined }

    await expect(
      transformImageFile(input, {
        width: 8,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      }),
    ).rejects.toBeInstanceOf(TransformError)

    const outputPath = mockTransformImageToFile.mock.calls[0]?.[1]
    expect(outputPath).toEqual(expect.any(String))
    await expect(access(dirname(outputPath!))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
