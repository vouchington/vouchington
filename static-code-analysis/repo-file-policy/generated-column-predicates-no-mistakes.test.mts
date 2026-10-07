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

type Rule = { name?: string; rule?: string; options?: Record<string, unknown> }
type Diagnostic = { file: string; rule: string }

// Exercise the released analyzer with the repository's real options instead of
// reimplementing SQL parsing. This proves migration schema, config entries,
// non-primary UUIDv7 sources, runtime scripts, and every re-included helper.
describe('generated-column predicate no-mistakes configuration', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('rejects every configured source and clause, then accepts its source-column predicate', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'generated-column-predicate-'))
    dirs.push(directory)
    await track(directory, 'backend/data-stores/psql/migrations/0999.sql', schema())
    await writeFixture(directory, 'created_at')

    const rejected = check(directory)
    expect(rejected.status).toBe(1)
    expect(findings(rejected)).toHaveLength(91)
    expect(ownedFiles(findings(rejected))).toEqual(
      ['backend/services/queries.mts', 'backend/scripts/runtime.mts', ...helperPaths].toSorted(),
    )
    expect(new Set(findings(rejected).map(finding => finding.rule))).toEqual(
      new Set(['postgres-generated-column-predicates']),
    )

    await writeFixture(directory, 'source')
    const corrected = check(directory)
    expect(corrected.status).toBe(0)
    expect(findings(corrected)).toEqual([])
  })
})

async function writeFixture(root: string, column: 'created_at' | 'source'): Promise<void> {
  const rules = await fixtureRules()
  await track(root, 'backend/services/queries.mts', querySource(column))
  await track(root, 'backend/scripts/runtime.mts', querySource(column))
  for (const path of helperPaths) await track(root, path, querySource(column))
  await writeFile(join(root, '.no-mistakes.yml'), stringify({ rules }))
  await initAndTrack(root)
}

async function fixtureRules(): Promise<Rule[]> {
  const config = parse(await readFile(join(repository, '.no-mistakes.yml'), 'utf8')) as {
    rules: Rule[]
  }
  const rules = config.rules.filter(rule => rule.rule === 'postgres-generated-column-predicates')
  expect(rules).toHaveLength(2)
  // Use the actual scopes; this fixture must fail if scripts, helpers, or DDL are omitted.
  return rules
}

function schema(): string {
  return `
    CREATE TABLE widgets (
      id uuid PRIMARY KEY DEFAULT uuidv7(),
      created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
    );
    CREATE TABLE composite_widgets (
      partition_id uuid NOT NULL,
      id uuid NOT NULL DEFAULT uuidv7(),
      created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
      PRIMARY KEY (partition_id, id)
    );
    CREATE TABLE follower_distribution_deliveries (
      distribution_id uuid NOT NULL,
      recipient_user_id uuid NOT NULL,
      delivery_id uuid NOT NULL DEFAULT uuidv7(),
      created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(delivery_id)) VIRTUAL,
      PRIMARY KEY (distribution_id, recipient_user_id)
    );
  `
}

function querySource(column: 'created_at' | 'source'): string {
  const widgets = column === 'created_at' ? 'created_at' : 'id'
  const follower = column === 'created_at' ? 'created_at' : 'delivery_id'
  const configured = column === 'created_at' ? 'created_at' : 'id'
  const composite = column === 'created_at' ? 'created_at' : 'id'
  return `import { read } from '@data-stores/psql'
export async function run() {
  const bound = \`SELECT id FROM widgets WHERE ${widgets} > $1\`
  await read(bound)
  await read(\`SELECT id FROM widgets WHERE ${widgets} > $1\`)
  await read(\`SELECT a.id FROM widgets a JOIN widgets b ON a.${widgets} > $1\`)
  await read(\`SELECT id FROM widgets ORDER BY ${widgets}\`)
  await read(\`SELECT id FROM post_votes WHERE ${configured} > $1\`)
  await read(\`SELECT a.id FROM post_votes a JOIN post_votes b ON a.${configured} > $1\`)
  await read(\`SELECT id FROM post_votes ORDER BY ${configured}\`)
  await read(\`SELECT id FROM composite_widgets WHERE ${composite} > $1\`)
  await read(\`SELECT a.id FROM composite_widgets a JOIN composite_widgets b ON a.${composite} > $1\`)
  await read(\`SELECT id FROM composite_widgets ORDER BY ${composite}\`)
  await read(\`SELECT delivery_id FROM follower_distribution_deliveries WHERE ${follower} > $1\`)
  await read(\`SELECT a.delivery_id FROM follower_distribution_deliveries a JOIN follower_distribution_deliveries b ON a.${follower} > $1\`)
  await read(\`SELECT delivery_id FROM follower_distribution_deliveries ORDER BY ${follower}\`)
}\n`
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

function findings(result: { stdout: string }): Diagnostic[] {
  return JSON.parse(result.stdout).rules
}

function ownedFiles(diagnostics: Diagnostic[]): string[] {
  return [...new Set(diagnostics.map(diagnostic => diagnostic.file))].toSorted()
}
