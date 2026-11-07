import { mkdtempDisposable } from 'node:fs/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { checkImageRuntime } from './image-smoke.mts'

describe('image runtime smoke assertions', () => {
  it.each([
    { scenario: 'API native addons', uid: 65532, argument: undefined, addon: true, valid: true },
    {
      scenario: 'IO native addons and libraries',
      uid: 65532,
      argument: 'io',
      addon: true,
      valid: true,
    },
    { scenario: 'root user', uid: 0, argument: undefined, addon: true, valid: false },
    { scenario: 'unset TMPDIR', uid: 65532, argument: undefined, addon: true, valid: false },
    { scenario: 'missing TMPDIR', uid: 65532, argument: undefined, addon: true, valid: false },
    { scenario: 'no native addons', uid: 65532, argument: undefined, addon: false, valid: false },
    { scenario: 'extra IO shared library', uid: 65532, argument: 'io', addon: true, valid: false },
    { scenario: 'unknown argument', uid: 65532, argument: 'unknown', addon: true, valid: false },
  ])('$scenario', async ({ scenario, uid, argument, addon, valid }) => {
    await using root = await mkdtempDisposable(join(tmpdir(), 'image-runtime-smoke-'))
    const libraryDirectory = join(root.path, 'lib')
    mkdirSync(libraryDirectory)
    writeFileSync(join(libraryDirectory, 'libduckdb.so'), '')
    if (scenario === 'extra IO shared library') {
      writeFileSync(join(libraryDirectory, 'unexpected.so'), '')
    }
    if (addon) writeFileSync(join(root.path, '.bun-65532-synthetic.node'), '')
    writeFileSync(join(root.path, '.bun-0-wrong-user.node'), '')
    writeFileSync(join(root.path, 'unrelated.node'), '')
    writeFileSync(join(root.path, '.bun-65532-not-an-addon.txt'), '')
    const previousArgv = process.argv
    vi.spyOn(process, 'getuid').mockReturnValue(uid)
    vi.stubEnv('TMPDIR', scenario === 'unset TMPDIR' ? '' : root.path)
    if (scenario === 'missing TMPDIR') vi.stubEnv('TMPDIR', join(root.path, 'missing'))
    process.argv = [...previousArgv.slice(0, 2), ...(argument === undefined ? [] : [argument])]
    try {
      let failure: unknown
      try {
        checkImageRuntime(libraryDirectory)
      } catch (err) {
        failure = err
      }
      expect(failure instanceof Error).toBe(!valid)
    } finally {
      process.argv = previousArgv
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    }
  })
})
