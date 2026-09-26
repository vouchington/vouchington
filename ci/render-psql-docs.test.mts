import {
  existsSync,
  mkdirSync,
  mkdtempDisposableSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { main, renderPsqlDocs } from './render-psql-docs.mts'

const SAMPLE_INDEX =
  '# PostgreSQL Schema Snapshot\n\nSee [schema-snapshot/README.md](../README.md). [JSON](../schema.json)\n\n- [Widgets](tables/widgets.md)\n'
const SAMPLE_TABLE =
  '# Table `widgets`\n\n[Schema index](../README.md)\n\n| Column | Type |\n| --- | --- |\n| `id` | `uuid` |\n'
const SAMPLE_SECTION = '# Views\n\n[Schema index](README.md)\n'
const SAMPLE_SCHEMA_JSON = JSON.stringify({ tables: [{ name: 'widgets' }] }, null, 2)

function writeSampleSchema(schemaDir: string): void {
  mkdirSync(join(schemaDir, 'markdown/tables'), { recursive: true })
  writeFileSync(join(schemaDir, 'markdown/README.md'), SAMPLE_INDEX)
  writeFileSync(join(schemaDir, 'markdown/tables/widgets.md'), SAMPLE_TABLE)
  writeFileSync(join(schemaDir, 'markdown/views.md'), SAMPLE_SECTION)
  writeFileSync(join(schemaDir, 'schema.json'), SAMPLE_SCHEMA_JSON)
}

describe('renderPsqlDocs', () => {
  it('publishes raw and HTML schema leaves while retaining schema.md as the generated index', async () => {
    using root = mkdtempDisposableSync(join(tmpdir(), 'render-psql-docs-'))
    const schemaDir = join(root.path, 'schema-snapshot')
    const outputDir = join(root.path, 'out')
    writeSampleSchema(schemaDir)
    await renderPsqlDocs({ outputDir, schemaDir })

    expect(readFileSync(join(outputDir, 'schema.md'), 'utf8')).toBe(
      SAMPLE_INDEX.replace(
        '[schema-snapshot/README.md](../README.md)',
        '`schema-snapshot/README.md`',
      ).replace('../schema.json', 'schema.json'),
    )
    expect(readFileSync(join(outputDir, 'schema.json'), 'utf8')).toBe(SAMPLE_SCHEMA_JSON)
    expect(readFileSync(join(outputDir, 'tables/widgets.md'), 'utf8')).toBe(
      SAMPLE_TABLE.replace('../README.md', '../schema.md'),
    )
    expect(readFileSync(join(outputDir, 'views.md'), 'utf8')).toBe(
      SAMPLE_SECTION.replace('README.md', 'schema.md'),
    )
    expect(readFileSync(join(outputDir, 'tables/widgets.html'), 'utf8')).toContain('<table>')
    expect(readFileSync(join(outputDir, 'index.html'), 'utf8')).toContain(
      'href="tables/widgets.html"',
    )
    expect(readFileSync(join(outputDir, 'index.html'), 'utf8')).toContain('href="schema.json"')
    expect(readFileSync(join(outputDir, 'index.html'), 'utf8')).not.toContain(
      'href="../README.html"',
    )
    expect(readFileSync(join(outputDir, 'tables/widgets.html'), 'utf8')).toContain(
      'href="../index.html"',
    )
    expect(readFileSync(join(outputDir, 'views.html'), 'utf8')).toContain('href="index.html"')
  })

  it('reports the missing Markdown directory before other absent schema inputs', async () => {
    using root = mkdtempDisposableSync(join(tmpdir(), 'render-psql-docs-'))

    await expect(
      renderPsqlDocs({ outputDir: join(root.path, 'out'), schemaDir: join(root.path, 'missing') }),
    ).rejects.toThrow('Cannot read PostgreSQL schema Markdown directory')
  })

  it('reports a missing schema.json after discovering the Markdown tree', async () => {
    using root = mkdtempDisposableSync(join(tmpdir(), 'render-psql-docs-'))
    const schemaDir = join(root.path, 'schema-snapshot')
    writeSampleSchema(schemaDir)
    rmSync(join(schemaDir, 'schema.json'))

    await expect(renderPsqlDocs({ outputDir: join(root.path, 'out'), schemaDir })).rejects.toThrow(
      `Cannot read PostgreSQL schema snapshot at ${join(schemaDir, 'schema.json')}`,
    )
  })

  it('returns exit code 2 and prints usage when no output directory is given', async () => {
    await expect(main([])).resolves.toBe(2)
  })
})

describe('render-psql-docs CLI', () => {
  it('runs end-to-end against the committed schema snapshot', () => {
    using root = mkdtempDisposableSync(join(tmpdir(), 'render-psql-docs-cli-'))
    const outputDir = join(root.path, 'out')
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), 'ci/render-psql-docs.mts'), outputDir],
      { encoding: 'utf8' },
    )
    expect(result).toMatchObject({ status: 0, stderr: '' })
    expect(existsSync(join(outputDir, 'index.html'))).toBe(true)
    expect(existsSync(join(outputDir, 'tables'))).toBe(true)
    expect(readFileSync(join(outputDir, 'schema.md'), 'utf8')).toBe(
      readFileSync('backend/data-stores/psql/schema-snapshot/markdown/README.md', 'utf8')
        .replace('[schema-snapshot/README.md](../README.md)', '`schema-snapshot/README.md`')
        .replace('../schema.json', 'schema.json'),
    )
  })
})
