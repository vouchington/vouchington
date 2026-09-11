import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  main,
  protectStorybookArtifact,
  validateStorybookArtifact,
  writeProtectedStorybookTombstone,
  writeStorybookTombstone,
} from './storybook-pages.mts'

function withTempDirectory(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'storybook-pages-'))
  try {
    run(root)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
}

function writeArtifact(root: string): void {
  mkdirSync(join(root, 'assets'), { recursive: true })
  writeFileSync(join(root, 'index.html'), '<html>Storybook</html>')
  writeFileSync(join(root, 'assets', 'main.js'), 'main')
}

describe('Storybook Cloudflare Pages tooling', () => {
  it('accepts only the retained artifact commands', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      await expect(main(['cleanup'])).resolves.toBe(2)
      expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toBe(
        [
          'Usage: storybook-pages.mts validate <artifact-root>',
          '       storybook-pages.mts protect <artifact-root>',
          '       storybook-pages.mts tombstone <destination>',
          '',
        ].join('\n'),
      )
    } finally {
      stderr.mockRestore()
    }
  })

  it('injects the trusted Basic Auth worker only after validating the static artifact', () => {
    withTempDirectory(root => {
      writeArtifact(root)
      protectStorybookArtifact(root)

      expect(readFileSync(join(root, '_worker.js'), 'utf8')).toContain('BASIC_AUTH_CREDENTIALS')
    })
  })

  it('injects the trusted Basic Auth worker into disposable preview canary tombstones', () => {
    withTempDirectory(root => {
      writeProtectedStorybookTombstone(root)

      expect(existsSync(join(root, '404.html'))).toBe(true)
      expect(readFileSync(join(root, '_worker.js'), 'utf8')).toContain('BASIC_AUTH_CREDENTIALS')
    })
  })

  it('accepts a bounded static Storybook artifact', () => {
    withTempDirectory(root => {
      writeArtifact(root)

      expect(validateStorybookArtifact(root)).toEqual({ files: 2, totalBytes: 26 })
    })
  })

  it('requires an index and enforces file, file-count, and total-size limits', () => {
    withTempDirectory(root => {
      mkdirSync(root, { recursive: true })
      expect(() => validateStorybookArtifact(root)).toThrow('missing index.html')

      writeArtifact(root)
      expect(() => validateStorybookArtifact(root, { maxFileBytes: 3 })).toThrow(
        'exceeds the 3-byte file limit',
      )
      expect(() => validateStorybookArtifact(root, { maxFiles: 1 })).toThrow(
        'exceeds the 1-file limit',
      )
      expect(() => validateStorybookArtifact(root, { maxTotalBytes: 10 })).toThrow(
        'exceeds the 10-byte site limit',
      )
    })
  })

  it('rejects symlinks and Pages control files from the untrusted artifact', () => {
    withTempDirectory(root => {
      writeArtifact(root)
      symlinkSync(join(root, 'index.html'), join(root, 'leak'))
      expect(() => validateStorybookArtifact(root)).toThrow('Unsafe Storybook entry')

      rmSync(join(root, 'leak'))
      for (const reserved of [
        '_worker.JS',
        '_headers',
        '_redirects',
        '_Routes.json',
        'Functions',
        '.wrangler',
        '.git',
        'node_modules',
      ]) {
        const path = join(root, reserved)
        writeFileSync(path, 'unsafe')
        expect(() => validateStorybookArtifact(root)).toThrow(
          `reserved Pages control path: ${reserved}`,
        )
        rmSync(path)
      }
    })
  })

  it('writes a native Pages 404 tombstone without an unsupported redirect rule', () => {
    withTempDirectory(root => {
      writeStorybookTombstone(root)

      expect(readFileSync(join(root, '404.html'), 'utf8')).toContain('Preview unavailable')
      expect(existsSync(join(root, 'index.html'))).toBe(false)
      expect(existsSync(join(root, '_redirects'))).toBe(false)
    })
  })
})
