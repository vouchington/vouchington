import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { format } from 'oxfmt'
import { publishSchemaSnapshot } from './publish.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import type { PostgresCatalog } from 'no-mistakes'

vi.mock<typeof import('oxfmt')>(import('oxfmt'), async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, format: vi.fn<typeof actual.format>(actual.format) }
})

const actualOxfmt = await vi.importActual<typeof import('oxfmt')>('oxfmt')
const snapshot: SchemaSnapshot = {
  formatVersion: 2,
  tables: {},
  views: {},
  enums: {},
  extensions: {},
  functions: {},
  policies: {},
}
const catalog: PostgresCatalog = {
  formatVersion: 2,
  coverage: 'complete',
  schema: 'public',
  currentDatabase: 'voucha',
  tables: {},
  functions: {},
  enums: {},
  views: {},
}

describe('schema publisher formatting failures', () => {
  const roots: string[] = []
  afterEach(async () => {
    vi.mocked(format).mockImplementation(actualOxfmt.format)
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  it('preserves formatter diagnostics while still publishing the independent catalog', async () => {
    const root = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'schema-publisher-error-'))
    roots.push(root)
    const target = join(root, 'schema.json')
    const failure = await actualOxfmt.format('invalid-fixture.ts', 'const =')
    let rejected = false
    vi.mocked(format).mockImplementation((path, raw, options) => {
      if (path !== target || rejected) return actualOxfmt.format(path, raw, options)
      rejected = true
      return Promise.resolve({
        ...failure,
        errors: failure.errors.map(error => ({ ...error, message: 'owned formatter diagnostic' })),
      })
    })

    const publishing = publishSchemaSnapshot({ snapshot, markdown: new Map(), catalog, root })
    await expect(publishing).rejects.toThrow(
      `oxfmt failed to format ${target}:\nowned formatter diagnostic`,
    )
    await expect(publishing).rejects.not.toBeInstanceOf(AggregateError)
    await expect(publishing).rejects.not.toThrow('The PostgreSQL schema snapshot is stale.')
    await expect(readFile(target, 'utf8')).rejects.toThrow(/ENOENT/)
    expect(JSON.parse(await readFile(join(root, 'no-mistakes-catalog.json'), 'utf8'))).toEqual(
      catalog,
    )
  })
})
