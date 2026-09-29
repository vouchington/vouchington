import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stableStringify } from '@modules/utils/stable-stringify'
import { writeSchemaSnapshot } from '../generate.mts'
import { renderSchemaMarkdown } from '../render-markdown.mts'
import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

describe('schema snapshot output roots', () => {
  it('checks the committed snapshot using the canonical JSON and documentation roots', async () => {
    const snapshot = JSON.parse(
      await readFile(new URL('../schema.json', import.meta.url), 'utf8'),
    ) as SchemaSnapshot
    await expect(
      writeSchemaSnapshot({
        snapshot,
        markdown: renderSchemaMarkdown(snapshot),
        check: true,
      }),
    ).resolves.toBeUndefined()
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
