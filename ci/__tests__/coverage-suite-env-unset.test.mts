import { rmSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { envForCoverageRun } from '../coverage-suite-env.mts'

describe('coverage suite environment removal', () => {
  it('removes suite-declared variables after loading the current worktree .env', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'voucha-coverage-env-unset-test-'))
    try {
      await writeFile(join(tmpDir, '.initialized'), 'web')
      await writeFile(
        join(tmpDir, '.env'),
        [
          `export WORKTREE_DIR=${basename(tmpDir)}`,
          'export DATABASE_URL=postgres://localhost/voucha-coverage-test',
          'export VALKEY_URL=redis://localhost:6379',
          'export CF_WORKER_SECRET=must-not-reach-local-coverage',
        ].join('\n'),
      )

      const env = envForCoverageRun(
        { requiresWebInit: true, unsetEnv: ['CF_WORKER_SECRET'] },
        tmpDir,
        {},
      )

      expect(env.DATABASE_URL).toBe('postgres://localhost/voucha-coverage-test')
      expect(env.CF_WORKER_SECRET).toBeUndefined()
    } finally {
      rmSync(tmpDir, { force: true, recursive: true })
    }
  })
})
