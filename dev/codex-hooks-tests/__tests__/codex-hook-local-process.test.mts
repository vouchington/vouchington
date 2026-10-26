import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { gitHeadPathExists, oxfmtFailure } from '../../codex-hooks/local-process.mts'
import { git } from '../git-remote-repo.mts'
import { withTestTempDir } from '../test-temp-root.mts'

describe('codex hook local process boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('checks HEAD-relative path existence', async () => {
    await withTestTempDir('voucha-local-process-', async dir => {
      git(dir, 'init', '-q', '-b', 'main')
      git(dir, 'config', 'user.name', 'Codex Hooks Test')
      git(dir, 'config', 'user.email', 'codex-hooks-test@example.test')
      writeFileSync(join(dir, 'package.json'), '{}\n')
      git(dir, 'add', 'package.json')
      git(dir, 'commit', '-q', '-m', 'package')
      expect(gitHeadPathExists(dir, 'package.json')).toBe(true)
      expect(gitHeadPathExists(dir, 'missing.json')).toBe(false)
    })
  })

  it('fails open when oxfmt is unavailable', async () => {
    await withTestTempDir('voucha-local-process-', async dir => {
      vi.stubEnv('PATH', '')
      expect(oxfmtFailure(dir, join(dir, 'missing.yml'))).toBeUndefined()
    })
  })
})
