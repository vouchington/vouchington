import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stableStringify } from '@modules/utils/stable-stringify'
import { writeSchemaSnapshot } from '../generate.mts'
import { NO_MISTAKES_CATALOG_FILE } from '../no-mistakes-catalog.mts'
import { renderSchemaMarkdown } from '../render-markdown.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'
import type { PostgresCatalog } from 'no-mistakes'

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
const markdown = renderSchemaMarkdown(snapshot)

describe('schema snapshot and no-mistakes catalog share one check flow', () => {
  const roots: string[] = []

  async function tempRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'schema-snapshot-catalog-'))
    roots.push(root)
    return root
  }

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
  })

  it('writes the catalog beside schema.json and accepts both in check mode', async () => {
    const root = await tempRoot()
    await writeSchemaSnapshot({ snapshot, markdown, catalog, root })

    await expect(readFile(join(root, 'schema.json'), 'utf8')).resolves.toBe(
      stableStringify(snapshot),
    )
    expect(JSON.parse(await readFile(join(root, NO_MISTAKES_CATALOG_FILE), 'utf8'))).toEqual(
      catalog,
    )
    await expect(
      writeSchemaSnapshot({ snapshot, markdown, catalog, root, check: true }),
    ).resolves.toBeUndefined()
  })

  it('leaves the catalog alone when the caller supplies none', async () => {
    const root = await tempRoot()
    await writeSchemaSnapshot({ snapshot, markdown, root })

    await expect(readFile(join(root, NO_MISTAKES_CATALOG_FILE), 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('fails check mode when only the catalog is stale', async () => {
    const root = await tempRoot()
    await writeSchemaSnapshot({ snapshot, markdown, catalog, root })
    await writeFile(join(root, NO_MISTAKES_CATALOG_FILE), '{"coverage":"complete"}\n')
    const check = () => writeSchemaSnapshot({ snapshot, markdown, catalog, root, check: true })

    await expect(check()).rejects.toThrow(join(root, NO_MISTAKES_CATALOG_FILE))
    await expect(check()).rejects.toThrow(/db:snapshot:update/)
    await expect(check()).rejects.not.toBeInstanceOf(AggregateError)
    await expect(check()).rejects.not.toThrow(join(root, 'schema.json'))
  })

  it('fails check mode when only schema.json is stale', async () => {
    const root = await tempRoot()
    await writeSchemaSnapshot({ snapshot, markdown, catalog, root })
    await writeFile(join(root, 'schema.json'), '{}\n')
    const check = () => writeSchemaSnapshot({ snapshot, markdown, catalog, root, check: true })

    await expect(check()).rejects.toThrow(join(root, 'schema.json'))
    await expect(check()).rejects.not.toBeInstanceOf(AggregateError)
    await expect(check()).rejects.not.toThrow(NO_MISTAKES_CATALOG_FILE)
  })

  it('reports every stale generated file in one error, and one update fixes both', async () => {
    const root = await tempRoot()
    await writeSchemaSnapshot({ snapshot, markdown, catalog, root })
    await writeFile(join(root, 'schema.json'), '{}\n')
    await writeFile(join(root, NO_MISTAKES_CATALOG_FILE), '{}\n')
    const check = () => writeSchemaSnapshot({ snapshot, markdown, catalog, root, check: true })

    await expect(check()).rejects.toBeInstanceOf(AggregateError)
    await expect(check()).rejects.toThrow(join(root, 'schema.json'))
    await expect(check()).rejects.toThrow(join(root, NO_MISTAKES_CATALOG_FILE))

    await writeSchemaSnapshot({ snapshot, markdown, catalog, root })
    await expect(check()).resolves.toBeUndefined()
  })
})
