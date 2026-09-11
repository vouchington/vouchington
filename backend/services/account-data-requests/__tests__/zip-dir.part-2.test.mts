import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZipFile } from 'yazl'
import { zipDir } from '../export.mts'
import type { createWriteStream } from 'node:fs'

describe('zipDir error handling', () => {
  const createWriteStreamSpy = vi.fn<typeof createWriteStream>()

  afterEach(() => {
    vi.restoreAllMocks()
    createWriteStreamSpy.mockReset()
  })

  it('awaits the output pipeline so the destination finalizes before zipDir rejects when addFile throws mid-loop', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'voucha-zipdir-mock-'))
    const sourceDir = join(parent, 'src')
    const destPath = join(parent, 'out.zip')

    try {
      await mkdir(sourceDir)
      await writeFile(join(sourceDir, 'a.txt'), 'a')
      await writeFile(join(sourceDir, 'b.txt'), 'b')

      let closeFinalized = false
      const sink = new Writable({
        write(_chunk, _enc, cb) {
          cb()
        },
        final(cb) {
          queueMicrotask(() => {
            closeFinalized = true
            cb()
          })
        },
      })
      createWriteStreamSpy.mockReturnValueOnce(sink as never)

      const boom = new Error('addFile failed mid-loop')
      let calls = 0
      vi.spyOn(ZipFile.prototype, 'addFile').mockImplementation(() => {
        calls += 1
        if (calls === 2) throw boom
      })

      await expect(
        zipDir(sourceDir, destPath, { createWriteStream: createWriteStreamSpy }),
      ).rejects.toBe(boom)
      expect(closeFinalized).toBe(true)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('rejects with the async ZipFile error captured by the on(error) listener', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'voucha-zipdir-mock-'))
    const sourceDir = join(parent, 'src')
    const destPath = join(parent, 'out.zip')

    try {
      await mkdir(sourceDir)
      await writeFile(join(sourceDir, 'a.txt'), 'a')

      const fs = await vi.importActual<typeof import('node:fs')>('node:fs')
      createWriteStreamSpy.mockImplementation(((...args: Parameters<typeof fs.createWriteStream>) =>
        fs.createWriteStream(...args)) as never)

      const boom = new Error('zip stream read failed')
      // Needs `this` (ZipFile instance) and performs an async side effect with no return value; mockReturnValue shorthand is inapplicable
      vi.spyOn(ZipFile.prototype, 'addFile').mockImplementationOnce(function (this: ZipFile) {
        queueMicrotask(() => this.emit('error', boom))
      })

      await expect(
        zipDir(sourceDir, destPath, { createWriteStream: createWriteStreamSpy }),
      ).rejects.toThrow('zip stream read failed')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
