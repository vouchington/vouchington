import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { TempImageFile } from '../../temp-file.mts'
import { transformImageFile } from '../resize.mts'

describe('transformImageFile', () => {
  it('writes a transformed image to an owned temp artifact', async () => {
    const input = await createInputImage()
    try {
      const output = await transformImageFile(input, {
        width: 8,
        quality: 75,
        lossless: false,
        progressive: false,
        format: 'jpeg',
      })
      await expect(sharp(output.path).metadata()).resolves.toMatchObject({
        width: 8,
        format: 'jpeg',
      })
      await output.cleanup()
      await expect(access(output.path)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await input.cleanup()
    }
  })
})

async function createInputImage(): Promise<TempImageFile> {
  const directory = await mkdtemp(join(tmpdir(), 'resize-input-test-'))
  const path = join(directory, 'input.png')
  await writeFile(
    path,
    await sharp({ create: { width: 16, height: 16, channels: 3, background: 'red' } })
      .png()
      .toBuffer(),
  )
  return { path, cleanup: async () => rm(directory, { recursive: true, force: true }) }
}
