import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
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

  it('rejects generated Markdown paths outside the dedicated subtree', async () => {
    const root = await tempRoot()
    await expect(
      writeSchemaSnapshot({
        snapshot,
        markdown: new Map([['../escape.md', '# Escape\n']]),
        root,
      }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema Markdown path')
    await expect(readFile(join(root, 'escape.md'), 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('does not follow symlinked Markdown path components when writing generated files', async () => {
    const root = await tempRoot()
    const sentinelRoot = await tempRoot()
    const sentinelPath = join(sentinelRoot, 'widgets.md')
    const sentinel = 'Do not overwrite this file.\n'
    await mkdir(join(root, 'markdown'), { recursive: true })
    await writeFile(sentinelPath, sentinel)
    await symlink(sentinelRoot, join(root, 'markdown/tables'))

    await expect(
      writeSchemaSnapshot({ snapshot, markdown: renderSchemaMarkdown(snapshot), root }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe(sentinel)
  })

  it('does not follow symlinked Markdown leaves when writing generated files', async () => {
    const root = await tempRoot()
    const sentinelRoot = await tempRoot()
    const sentinelPath = join(sentinelRoot, 'widgets.md')
    const sentinel = 'Do not overwrite this file.\n'
    await mkdir(join(root, 'markdown/tables'), { recursive: true })
    await writeFile(sentinelPath, sentinel)
    await symlink(sentinelPath, join(root, 'markdown/tables/widgets.md'))

    await expect(
      writeSchemaSnapshot({ snapshot, markdown: renderSchemaMarkdown(snapshot), root }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe(sentinel)
  })

  it('does not follow a symlinked JSON snapshot when writing generated files', async () => {
    const root = await tempRoot()
    const sentinelRoot = await tempRoot()
    const sentinelPath = join(sentinelRoot, 'schema.json')
    const sentinel = 'Do not overwrite this file.\n'
    await writeFile(sentinelPath, sentinel)
    await symlink(sentinelPath, join(root, 'schema.json'))

    await expect(
      writeSchemaSnapshot({ snapshot, markdown: renderSchemaMarkdown(snapshot), root }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe(sentinel)
  })

  it('rejects symlinked Markdown path components in check mode', async () => {
    const root = await tempRoot()
    const sentinelRoot = await tempRoot()
    const sentinelPath = join(sentinelRoot, 'widgets.md')
    const sentinel = 'Do not read this file.\n'
    await writeFile(sentinelPath, sentinel)
    await symlink(sentinelRoot, join(root, 'markdown'))

    await expect(
      writeSchemaSnapshot({
        snapshot,
        markdown: renderSchemaMarkdown(snapshot),
        check: true,
        root,
      }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe(sentinel)
  })

  it('rejects symlinked Markdown leaves in check mode', async () => {
    const root = await tempRoot()
    const sentinelRoot = await tempRoot()
    const sentinelPath = join(sentinelRoot, 'widgets.md')
    const sentinel = 'Do not read this file.\n'
    await mkdir(join(root, 'markdown/tables'), { recursive: true })
    await writeFile(sentinelPath, sentinel)
    await symlink(sentinelPath, join(root, 'markdown/tables/widgets.md'))

    await expect(
      writeSchemaSnapshot({
        snapshot,
        markdown: renderSchemaMarkdown(snapshot),
        check: true,
        root,
      }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe(sentinel)
  })

  it('rejects a symlinked JSON snapshot in check mode', async () => {
    const root = await tempRoot()
    const sentinelRoot = await tempRoot()
    const sentinelPath = join(sentinelRoot, 'schema.json')
    const sentinel = 'Do not read this file.\n'
    await writeFile(sentinelPath, sentinel)
    await symlink(sentinelPath, join(root, 'schema.json'))

    await expect(
      writeSchemaSnapshot({
        snapshot,
        markdown: renderSchemaMarkdown(snapshot),
        check: true,
        root,
      }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
    await expect(readFile(sentinelPath, 'utf8')).resolves.toBe(sentinel)
  })

  it('rejects a non-directory Markdown parent component in check mode', async () => {
    const root = await tempRoot()
    await mkdir(join(root, 'markdown'), { recursive: true })
    await writeFile(join(root, 'markdown/tables'), 'Not a directory.\n')

    await expect(
      writeSchemaSnapshot({
        snapshot,
        markdown: renderSchemaMarkdown(snapshot),
        check: true,
        root,
      }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
  })

  it('rejects a symlinked snapshot root when writing generated files', async () => {
    const parent = await tempRoot()
    const root = join(parent, 'snapshot')
    const sentinelRoot = await tempRoot()
    await symlink(sentinelRoot, root)

    await expect(
      writeSchemaSnapshot({ snapshot, markdown: renderSchemaMarkdown(snapshot), root }),
    ).rejects.toThrow('Unsafe generated PostgreSQL schema snapshot path')
  })
})
