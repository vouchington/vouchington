import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import yauzl from 'yauzl'
import { zipDir } from '../export.mts'

interface ZipContents {
  entries: string[]
  files: Record<string, string>
}

async function readZip(zipPath: string): Promise<ZipContents> {
  return await new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zip) => {
      if (openErr) return reject(openErr)
      const entries: string[] = []
      const files: Record<string, string> = {}
      zip.on('error', reject)
      zip.on('end', () => resolve({ entries, files }))
      zip.on('entry', (entry: yauzl.Entry) => {
        entries.push(entry.fileName)
        if (entry.fileName.endsWith('/')) return zip.readEntry()
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr) return reject(streamErr)
          const chunks: Buffer[] = []
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('end', () => {
            files[entry.fileName] = Buffer.concat(chunks).toString('utf8')
            zip.readEntry()
          })
          stream.on('error', reject)
        })
      })
      zip.readEntry()
    })
  })
}

describe('zipDir', () => {
  it('creates a zip with all top-level files at the archive root', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'voucha-zipdir-test-'))
    const sourceDir = join(parent, 'src')
    const destPath = join(parent, 'out.zip')

    try {
      await mkdir(sourceDir)
      await writeFile(join(sourceDir, 'profile.csv'), 'id,name\n1,alice\n')
      await writeFile(join(sourceDir, 'posts.csv'), 'id,title\n1,hello\n')

      await zipDir(sourceDir, destPath)

      const stats = await stat(destPath)
      expect(stats.size).toBeGreaterThan(0)

      const { entries, files } = await readZip(destPath)
      expect(entries.sort()).toEqual(['posts.csv', 'profile.csv'])
      expect(files['profile.csv']).toBe('id,name\n1,alice\n')
      expect(files['posts.csv']).toBe('id,title\n1,hello\n')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('preserves nested directory structure', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'voucha-zipdir-test-'))
    const sourceDir = join(parent, 'src')
    const destPath = join(parent, 'out.zip')

    try {
      await mkdir(sourceDir)
      await mkdir(join(sourceDir, 'nested'))
      await writeFile(join(sourceDir, 'top.txt'), 'top-level\n')
      await writeFile(join(sourceDir, 'nested', 'inner.txt'), 'nested\n')

      await zipDir(sourceDir, destPath)

      const { entries, files } = await readZip(destPath)
      expect(entries.sort()).toEqual(['nested/inner.txt', 'top.txt'])
      expect(files['nested/inner.txt']).toBe('nested\n')
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('skips directory entries (only files appear in the archive)', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'voucha-zipdir-test-'))
    const sourceDir = join(parent, 'src')
    const destPath = join(parent, 'out.zip')

    try {
      await mkdir(sourceDir)
      await mkdir(join(sourceDir, 'sub'))
      await writeFile(join(sourceDir, 'sub', 'foo.txt'), 'foo\n')

      await zipDir(sourceDir, destPath)

      const { entries } = await readZip(destPath)
      expect(entries.sort()).toEqual(['sub/foo.txt'])
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
