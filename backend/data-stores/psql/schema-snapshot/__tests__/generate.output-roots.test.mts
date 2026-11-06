import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stableStringify } from '@modules/utils/stable-stringify'
import { publishSchemaSnapshot } from '../publish.mts'
import { renderSchemaMarkdown } from '../render-markdown.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

const schemaSnapshotDirectory = dirname(import.meta.dirname)
const snapshot: SchemaSnapshot = {
  formatVersion: 2,
  tables: {},
  views: {},
  enums: {},
  extensions: {},
  functions: {},
  policies: {},
}
const markdown = renderSchemaMarkdown(snapshot)

describe('schema snapshot output roots', () => {
  const roots: string[] = []
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  it('does not attach the committed markdown tree to a fixture root', async () => {
    const base = await mkdtemp(join(tmpdir(), 'schema-output-roots-'))
    roots.push(base)
    const root = join(base, 'schema-snapshot-fixture-root')
    await mkdir(root)
    const check = () => publishSchemaSnapshot({ snapshot, markdown, root, check: true })
    await expect(check()).rejects.toThrow(join(root, 'schema.json'))
    await expect(check()).rejects.toThrow(join(root, 'markdown/README.md'))
    await expect(check()).rejects.not.toThrow(
      resolve(
        schemaSnapshotDirectory,
        '../../../../docs/development/postgresql/schema-snapshot/markdown',
      ),
    )
  })

  it('keeps fixture outputs isolated and supports a separate Markdown directory', async () => {
    const base = await mkdtemp(join(tmpdir(), 'schema-output-roots-'))
    try {
      const root = join(base, 'runtime')
      const markdownRoot = join(base, 'docs/markdown')
      await Promise.all([mkdir(root), mkdir(markdownRoot, { recursive: true })])
      const snapshot: SchemaSnapshot = {
        formatVersion: 2,
        tables: {},
        views: {},
        enums: {},
        extensions: {},
        functions: {},
        policies: {},
      }
      const markdown = renderSchemaMarkdown(snapshot)
      await publishSchemaSnapshot({ snapshot, markdown, root, markdownRoot })
      await expect(readFile(join(root, 'schema.json'), 'utf8')).resolves.toBe(
        stableStringify(snapshot),
      )
      await expect(readFile(join(markdownRoot, 'README.md'), 'utf8')).resolves.toContain(
        '[Views](views.md)',
      )
      await expect(readFile(join(root, 'markdown/README.md'), 'utf8')).rejects.toThrow(/ENOENT/)
      await expect(
        publishSchemaSnapshot({ snapshot, markdown, root, markdownRoot, check: true }),
      ).resolves.toBeUndefined()
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
