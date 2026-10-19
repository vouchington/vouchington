import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { stableStringify } from '@modules/utils/stable-stringify'
import { writeSchemaSnapshot } from './generate.mts'
import { renderSchemaMarkdown } from './render-markdown.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

const snapshot: SchemaSnapshot = {
  formatVersion: 2,
  tables: {
    widgets: {
      relationKind: 'table',
      columns: {
        id: {
          type: 'uuid',
          nullable: false,
          defaultExpression: null,
          generatedExpression: null,
          identity: null,
          generated: null,
          collation: null,
          comment: null,
          ordinalPosition: 1,
        },
      },
      primaryKey: { definition: 'PRIMARY KEY (id)', columns: ['id'] },
      uniqueConstraints: {},
      checkConstraints: {},
      foreignKeys: {},
      indexes: {},
      triggers: {},
      comment: null,
      physicalPartition: null,
      partition: null,
      growth: 'bounded',
    },
  },
  views: {},
  enums: {},
  extensions: {},
  functions: {},
  policies: {},
}

describe('writeSchemaSnapshot', () => {
  const roots: string[] = []

  async function tempRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'schema-snapshot-generate-'))
    roots.push(root)
    return root
  }

  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
  })

  it('writes stable JSON and the complete focused Markdown tree', async () => {
    const root = await tempRoot()
    await writeSchemaSnapshot({ snapshot, markdown: renderSchemaMarkdown(snapshot), root })

    await expect(readFile(join(root, 'schema.json'), 'utf8')).resolves.toBe(
      stableStringify(snapshot),
    )
    await expect(readFile(join(root, 'markdown/README.md'), 'utf8')).resolves.toContain(
      '[`widgets`](tables/widgets.md)',
    )
    await expect(readFile(join(root, 'markdown/tables/widgets.md'), 'utf8')).resolves.toContain(
      '# Table `widgets`',
    )
  })

  it('accepts matching generated files in check mode', async () => {
    const root = await tempRoot()
    const markdown = renderSchemaMarkdown(snapshot)
    await writeSchemaSnapshot({ snapshot, markdown, root })
    await expect(
      writeSchemaSnapshot({ snapshot, markdown, check: true, root }),
    ).resolves.toBeUndefined()
  })

  it('reports missing, changed, legacy, and orphaned generated Markdown in check mode', async () => {
    const root = await tempRoot()
    const markdown = renderSchemaMarkdown(snapshot)
    await expect(writeSchemaSnapshot({ snapshot, markdown, check: true, root })).rejects.toThrow(
      /db:snapshot:update/,
    )
    await expect(writeSchemaSnapshot({ snapshot, markdown, check: true, root })).rejects.toThrow(
      join(root, 'markdown/tables/widgets.md'),
    )

    await writeSchemaSnapshot({ snapshot, markdown, root })
    await writeFile(join(root, 'markdown/tables/widgets.md'), '# Stale content\n')
    await writeFile(join(root, 'markdown/orphan.md'), '# Orphan\n')
    await writeFile(join(root, 'schema.md'), '# Legacy\n')

    await expect(writeSchemaSnapshot({ snapshot, markdown, check: true, root })).rejects.toThrow(
      /db:snapshot:update/,
    )
    await expect(writeSchemaSnapshot({ snapshot, markdown, check: true, root })).rejects.toThrow(
      join(root, 'markdown/tables/widgets.md'),
    )
    await expect(writeSchemaSnapshot({ snapshot, markdown, check: true, root })).rejects.toThrow(
      join(root, 'markdown/orphan.md'),
    )
    await expect(writeSchemaSnapshot({ snapshot, markdown, check: true, root })).rejects.toThrow(
      join(root, 'schema.md'),
    )
  })

  it('removes only legacy and orphaned generated Markdown during update', async () => {
    const root = await tempRoot()
    const markdown = renderSchemaMarkdown(snapshot)
    await writeSchemaSnapshot({ snapshot, markdown, root })
    await writeFile(join(root, 'markdown/orphan.md'), '# Orphan\n')
    await writeFile(join(root, 'schema.md'), '# Legacy\n')

    await writeSchemaSnapshot({ snapshot, markdown, root })

    await expect(readFile(join(root, 'markdown/orphan.md'), 'utf8')).rejects.toThrow(/ENOENT/)
    await expect(readFile(join(root, 'schema.md'), 'utf8')).rejects.toThrow(/ENOENT/)
    await expect(readFile(join(root, 'schema.json'), 'utf8')).resolves.toBe(
      stableStringify(snapshot),
    )
  })
})
