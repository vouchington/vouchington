import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const OXLINT = resolve('node_modules/.bin/oxlint')
const PLUGIN = fileURLToPath(import.meta.resolve('eslint-plugin-vouchington'))
const EXPORT = 'backend/services/account-data-requests/export.mts'

describe('configured serial cursor drains', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'voucha-serial-cursor-drains-'))
    mkdirSync(dirname(join(root, EXPORT)), { recursive: true })
    writeFileSync(
      join(root, '.oxlintrc.json'),
      JSON.stringify({
        categories: { correctness: 'off', suspicious: 'off', perf: 'off' },
        jsPlugins: [{ name: 'vouchington', specifier: PLUGIN }],
        plugins: [],
        rules: {
          'vouchington/serial-cursor-drains': [
            'error',
            {
              include: [],
              includeFiles: [EXPORT],
              functions: ['writeBookmarksCsv', 'writeEntityRelationsCsv'],
            },
          ],
        },
      }),
    )
  })

  afterAll(() => {
    rmSync(root, { force: true, recursive: true })
  })

  it.each([
    {
      title: 'rejects parallel bookmark drains',
      file: EXPORT,
      code: 'async function writeBookmarksCsv() { await Promise.all(rows.map(drain)) }',
      expected: 1,
    },
    {
      title: 'rejects parallel entity relation drains',
      file: EXPORT,
      code: 'async function writeEntityRelationsCsv() { await Promise.allSettled(rows.flatMap(drain)) }',
      expected: 1,
    },
    {
      title: 'accepts a serial cursor loop',
      file: EXPORT,
      code: 'async function writeBookmarksCsv() { for (const row of rows) await drain(row) }',
      expected: 0,
    },
    {
      title: 'ignores the same shape outside the export file',
      file: 'backend/services/account-data-requests/unrelated.mts',
      code: 'async function writeBookmarksCsv() { await Promise.all(rows.map(drain)) }',
      expected: 0,
    },
    {
      title: 'ignores another function in the export file',
      file: EXPORT,
      code: 'async function unrelated() { await Promise.all(rows.map(drain)) }',
      expected: 0,
    },
    {
      title: 'ignores a locally shadowed Promise',
      file: EXPORT,
      code: 'async function writeBookmarksCsv(Promise) { await Promise.all(rows.map(drain)) }',
      expected: 0,
    },
  ])('$title', ({ file, code, expected }) => {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, code)
    const result = spawnSync(OXLINT, ['-c', '.oxlintrc.json', '--format', 'json', file], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(expected === 0 ? 0 : 1)
    const { diagnostics } = JSON.parse(result.stdout) as { diagnostics: unknown[] }
    expect(diagnostics).toHaveLength(expected)
  })
})
