import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZipFile } from 'yazl'
import { zipDir } from '../export.mts'

describe('zipDir error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('awaits the output pipeline so the destination finalizes before zipDir rejects when addFile throws mid-loop', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'voucha-zipdir-mock-'))
    const sourceDir = join(parent, 'src')
    const destPath = join(parent, 'out.zip')

    try {
      await mkdir(sourceDir)
      await writeFile(join(sourceDir, 'a.txt'), 'a')
      await writeFile(join(sourceDir, 'b.txt'), 'b')

      const boom = new Error('addFile failed mid-loop')
      let calls = 0
      vi.spyOn(ZipFile.prototype, 'addFile').mockImplementation(() => {
        calls += 1
        if (calls === 2) throw boom
      })

      await expect(zipDir(sourceDir, destPath)).rejects.toBe(boom)
      // The pipeline is awaited, so the destination already holds the finished (empty) archive:
      // a bare end-of-central-directory record is 22 bytes.
      expect((await stat(destPath)).size).toBe(22)
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

      const boom = new Error('zip stream read failed')
      // Needs `this` (ZipFile instance) and performs an async side effect with no return value; mockReturnValue shorthand is inapplicable
      vi.spyOn(ZipFile.prototype, 'addFile').mockImplementationOnce(function (this: ZipFile) {
        queueMicrotask(() => this.emit('error', boom))
      })

      await expect(zipDir(sourceDir, destPath)).rejects.toThrow('zip stream read failed')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
