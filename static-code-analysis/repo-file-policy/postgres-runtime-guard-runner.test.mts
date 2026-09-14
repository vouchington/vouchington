import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import {
  checkPostgresRuntimeGuard,
  matchesPostgresRuntimeFile,
} from './postgres-runtime-guard-runner.mts'

describe('matchesPostgresRuntimeFile', () => {
  it('matches backend TypeScript files, including test files', () => {
    expect(matchesPostgresRuntimeFile('backend/services/posts/get.mts')).toBe(true)
    expect(matchesPostgresRuntimeFile('backend/services/posts/get.test.mts')).toBe(true)
    expect(matchesPostgresRuntimeFile('backend/services/posts/get.ts')).toBe(true)
  })

  it('rejects non-backend or non-TypeScript files', () => {
    expect(matchesPostgresRuntimeFile('web/lib/posts/get.mts')).toBe(false)
    expect(matchesPostgresRuntimeFile('backend/services/posts/README.md')).toBe(false)
  })
})

describe('checkPostgresRuntimeGuard', () => {
  const testDirs: string[] = []
  const schema: Pick<SchemaSnapshot, 'tables'> = { tables: {} }

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeRepo() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-postgres-runtime-guard-'))
    testDirs.push(dir)
    return dir
  }

  async function track(repoRoot: string, path: string, content: string) {
    await mkdir(dirname(join(repoRoot, path)), { recursive: true })
    await writeFile(join(repoRoot, path), content)
  }

  it(
    'flags an unannotated direct query in a tracked backend file',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      const file = 'backend/services/posts/get.mts'
      await track(
        dir,
        file,
        `import { read } from '@data-stores/psql'; await read(sql\`SELECT * FROM posts\`)`,
      )

      const errors: string[] = []
      checkPostgresRuntimeGuard(dir, [file], new Set(), schema, errors)

      expect(errors).toEqual([
        expect.stringContaining('query execution must start with a /* name */ annotation'),
      ])
    },
  )

  it('skips files outside the backend TypeScript file set', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    const file = 'web/lib/posts/get.ts'
    await track(
      dir,
      file,
      `import { read } from '@data-stores/psql'; await read(sql\`SELECT * FROM posts\`)`,
    )

    const errors: string[] = []
    checkPostgresRuntimeGuard(dir, [file], new Set(), schema, errors)

    expect(errors).toEqual([])
  })

  it('flags a stale entry in a tracked schema allowlist file', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    const file = 'backend/test-helpers/data-stores/psql/schema-static-analysis/uuid-allowlists.mts'
    await track(dir, file, `export const UUID_ALLOWLIST = [['removed_table.id', 'reason']]\n`)

    const errors: string[] = []
    checkPostgresRuntimeGuard(dir, [file], new Set(), schema, errors)

    expect(errors).toEqual([
      expect.stringContaining('stale PostgreSQL schema allowlist entry: removed_table.id'),
    ])
  })
})
