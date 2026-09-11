import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  checkSchemaDocDriftGuard,
  shouldReadSchemaDocDriftFile,
} from './schema-doc-drift-guard.mts'

describe('schema doc drift guard path prefilter', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('classifies only schema, documentation, and supported DML paths as readable', () => {
    expect(shouldReadSchemaDocDriftFile('backend/data-stores/psql/migrations/0001.sql')).toBe(true)
    expect(shouldReadSchemaDocDriftFile('web/lib/api/client/posts.mts')).toBe(true)
    expect(shouldReadSchemaDocDriftFile('docs/requirements/moderation/REPORTING.md')).toBe(true)
    expect(shouldReadSchemaDocDriftFile('docs/requirements/moderation/MODERATION-APPEALS.md')).toBe(
      true,
    )
    expect(shouldReadSchemaDocDriftFile('docs/requirements/users/LOCALIZATION.md')).toBe(false)
    expect(shouldReadSchemaDocDriftFile('assets/logo.png')).toBe(false)
  })

  it('does not read irrelevant tracked binary or configuration paths', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'voucha-schema-doc-prefilter-'))
    dirs.push(repoRoot)
    const sources = new Map([
      ['backend/data-stores/psql/migrations/0001.sql', 'CREATE TABLE posts (id uuid);'],
      ['backend/services/posts/write.mts', 'export const write = true'],
      ['assets/logo.png', 'not actually a PNG'],
    ])
    for (const [file, content] of sources) {
      await mkdir(dirname(join(repoRoot, file)), { recursive: true })
      await writeFile(join(repoRoot, file), content)
    }

    const reads: string[] = []
    checkSchemaDocDriftGuard(repoRoot, [...sources.keys()], { tables: {} } as never, [], file => {
      reads.push(file)
      return sources.get(file) ?? null
    })

    expect(reads).toEqual([
      'backend/data-stores/psql/migrations/0001.sql',
      'backend/services/posts/write.mts',
    ])
  })

  it('checks derived lifecycle status writes in moderation documentation', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'voucha-schema-doc-lifecycle-'))
    dirs.push(repoRoot)
    const file = 'docs/requirements/moderation/MODERATION-APPEALS.md'
    const content = "```sql\nUPDATE moderation_appeals SET status = 'approved' WHERE id = $1;\n```"
    await mkdir(dirname(join(repoRoot, file)), { recursive: true })
    await writeFile(join(repoRoot, file), content)

    const errors: string[] = []
    checkSchemaDocDriftGuard(repoRoot, [file], { tables: {} } as never, errors, () => content)

    expect(errors).toContain(
      `::error file=${file}::${file}: moderation_appeals.status is derived from lifecycle fields; do not write a physical status column`,
    )
  })
})
