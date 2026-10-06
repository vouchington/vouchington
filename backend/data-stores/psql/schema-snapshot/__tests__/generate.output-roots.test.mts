import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stableStringify } from '@modules/utils/stable-stringify'
import { resolveSchemaSnapshotOutputRoots, writeSchemaSnapshot } from '../generate.mts'
import { renderSchemaMarkdown } from '../render-markdown.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

const schemaSnapshotDirectory = dirname(import.meta.dirname)

describe('schema snapshot output roots', () => {
  it('points omitted roots at the schema directory and committed markdown tree', () => {
    expect(resolveSchemaSnapshotOutputRoots()).toEqual({
      root: schemaSnapshotDirectory,
      markdownRoot: resolve(
        schemaSnapshotDirectory,
        '../../../../docs/development/postgresql/schema-snapshot/markdown',
      ),
    })
  })

  it('does not attach the committed markdown tree to a fixture root', () => {
    const root = join(tmpdir(), 'schema-snapshot-fixture-root')
    expect(resolveSchemaSnapshotOutputRoots({ root })).toEqual({ root })
  })

  it('keeps an explicit markdown directory ahead of the committed default', () => {
    const markdownRoot = join(tmpdir(), 'schema-snapshot-fixture-markdown')
    expect(
      resolveSchemaSnapshotOutputRoots({ root: schemaSnapshotDirectory, markdownRoot }),
    ).toEqual({
      root: schemaSnapshotDirectory,
      markdownRoot,
    })
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
      await writeSchemaSnapshot({ snapshot, markdown, root, markdownRoot })
      await expect(readFile(join(root, 'schema.json'), 'utf8')).resolves.toBe(
        stableStringify(snapshot),
      )
      await expect(readFile(join(markdownRoot, 'README.md'), 'utf8')).resolves.toContain(
        '[Views](views.md)',
      )
      await expect(readFile(join(root, 'markdown/README.md'), 'utf8')).rejects.toThrow(/ENOENT/)
      await expect(
        writeSchemaSnapshot({ snapshot, markdown, root, markdownRoot, check: true }),
      ).resolves.toBeUndefined()
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
