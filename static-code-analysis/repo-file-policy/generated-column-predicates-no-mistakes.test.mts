import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'

const repository = fileURLToPath(new URL('../..', import.meta.url))
const cli = join(repository, 'node_modules/no-mistakes/bin/no-mistakes.js')
const helperPaths = [
  'backend/test-helpers/entities/create-test-entities.mts',
  'backend/test-helpers/entities/rss-feeds.mts',
  'backend/test-helpers/entities/topics/core.mts',
  'backend/test-helpers/entities/urls.mts',
  'backend/test-helpers/entities/users-direct.mts',
] as const
const configDrivenTable = 'post_votes'

type Rule = { name?: string; rule?: string; options?: Record<string, unknown> }

// Exercise the released analyzer with the repository's real options, rather than
// reimplementing SQL parsing in this repository.  The fixture covers catalog DDL,
// config-driven `extraGeneratedColumns`, WHERE/JOIN/ORDER BY, runtime scripts, and
// the separately included development helpers.
describe('generated-column predicate no-mistakes configuration', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('rejects every configured generated timestamp predicate and accepts corrected id predicates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'generated-column-predicate-'))
    dirs.push(directory)
    const rules = await fixtureRules()
    await track(
      directory,
      'backend/data-stores/psql/migrations/0999.sql',
      `
      CREATE TABLE widgets (
        id uuid PRIMARY KEY DEFAULT uuidv7(),
        created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
      );\n`,
    )
    await track(directory, 'backend/services/queries.mts', querySource('created_at'))
    await track(directory, 'backend/scripts/runtime.mts', scriptSource('created_at'))
    for (const path of helperPaths) await track(directory, path, helperSource('created_at'))
    await writeFile(join(directory, '.no-mistakes.yml'), stringify({ rules }))
    await initAndTrack(directory)

    const rejected = check(directory)
    expect(rejected.status).toBe(1)
    expect([...new Set(diagnostics(rejected).map(item => item.file))].toSorted()).toEqual(
      ['backend/scripts/runtime.mts', 'backend/services/queries.mts', ...helperPaths].toSorted(),
    )
    expect(diagnostics(rejected)).toHaveLength(10)

    await track(directory, 'backend/services/queries.mts', querySource('id'))
    await track(directory, 'backend/scripts/runtime.mts', scriptSource('id'))
    for (const path of helperPaths) await track(directory, path, helperSource('id'))
    await initAndTrack(directory)

    const corrected = check(directory)
    expect(corrected.status).toBe(0)
    expect(diagnostics(corrected)).toEqual([])
  })
})

async function fixtureRules(): Promise<Rule[]> {
  const config = parse(await readFile(join(repository, '.no-mistakes.yml'), 'utf8')) as {
    rules: Rule[]
  }
  const rules = config.rules.filter(rule => rule.rule === 'postgres-generated-column-predicates')
  expect(rules).toHaveLength(2)
  // Keep the real include/exclude/sqlInclude values intact: this fixture must
  // fail if the checked-in scope stops covering runtime scripts or any helper.
  return rules
}

function querySource(column: string): string {
  return `import { read } from '@data-stores/psql'
export async function run() {
  await read(\`SELECT id FROM widgets WHERE ${column} > $1\`)
  await read(\`SELECT a.id FROM widgets a JOIN widgets b ON a.${column} > CURRENT_TIMESTAMP\`)
  await read(\`SELECT id FROM widgets ORDER BY ${column}\`)
  await read(\`SELECT id FROM ${configDrivenTable} WHERE ${column} > $1\`)
}\n`
}

function scriptSource(column: string): string {
  return `import { read } from '@data-stores/psql'
export async function run() { await read(\`SELECT id FROM ${configDrivenTable} ORDER BY ${column}\`) }\n`
}

function helperSource(column: string): string {
  return `import { read } from '@data-stores/psql'
export async function run() { await read(\`SELECT id FROM ${configDrivenTable} WHERE ${column} > $1\`) }\n`
}

async function track(root: string, path: string, content: string): Promise<void> {
  const file = join(root, path)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

async function initAndTrack(directory: string): Promise<void> {
  expect(spawnSync('git', ['init', '-q', directory]).status).toBe(0)
  expect(spawnSync('git', ['-C', directory, 'add', '.']).status).toBe(0)
}

function check(directory: string) {
  return spawnSync(process.execPath, [cli, 'check', '--root', directory, '--format', 'json'], {
    encoding: 'utf8',
  })
}

function diagnostics(result: { stdout: string }): Array<{ file: string }> {
  return JSON.parse(result.stdout).rules
}
