import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'

const repository = fileURLToPath(new URL('../..', import.meta.url))
const cli = join(repository, 'node_modules/no-mistakes/bin/no-mistakes.js')
const sqlPaths = [
  'backend/data-stores/psql/migrations/0998.sql',
  'backend/data-stores/psql/views/current_records.sql',
  'backend/data-stores/psql/config-driven/current-records.sql',
] as const
const runtimePath = 'backend/services/queries.mts'

type Rule = { rule?: string }
type Diagnostic = { file: string; rule: string }

// Run the released analyzer with the checked-in rules. The fixture proves the
// schema-SQL globs and both newly enabled shape branches, not a local parser.
describe('SQL offset and shape no-mistakes configuration', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('rejects OFFSET, NOT IN, and COUNT existence checks in runtime and every schema SQL scope', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sql-shape-'))
    dirs.push(directory)
    await writeFixture(directory, badSql())

    const rejected = check(directory)
    expect(rejected.status).toBe(1)
    expect(ruleFindings(rejected, 'postgres-no-offset')).toHaveLength(4)
    expect(ownedFiles(ruleFindings(rejected, 'postgres-no-offset'))).toEqual(
      [...sqlPaths, runtimePath].toSorted(),
    )
    expect(ruleFindings(rejected, 'postgres-sql-shape-policy')).toHaveLength(8)
    expect(ownedFiles(ruleFindings(rejected, 'postgres-sql-shape-policy'))).toEqual(
      [...sqlPaths, runtimePath].toSorted(),
    )

    await writeFixture(directory, goodSql())
    const corrected = check(directory)
    expect(corrected.status).toBe(0)
    expect(findings(corrected)).toEqual([])
  })
})

async function writeFixture(root: string, statements: string): Promise<void> {
  for (const path of sqlPaths) await track(root, path, statements)
  await track(
    root,
    runtimePath,
    `import { read } from '@data-stores/psql'\nexport async function run() { await read(\`${statements}\`) }\n`,
  )
  await writeFile(join(root, '.no-mistakes.yml'), stringify({ rules: await fixtureRules() }))
  expect(spawnSync('git', ['init', '-q', root]).status).toBe(0)
  expect(spawnSync('git', ['-C', root, 'add', '.']).status).toBe(0)
}

async function fixtureRules(): Promise<Rule[]> {
  const config = parse(await readFile(join(repository, '.no-mistakes.yml'), 'utf8')) as {
    rules: Rule[]
  }
  const rules = config.rules.filter(rule =>
    ['postgres-no-offset', 'postgres-sql-shape-policy'].includes(rule.rule ?? ''),
  )
  expect(rules).toHaveLength(2)
  return rules
}

function badSql(): string {
  return `SELECT id FROM records OFFSET 1;
SELECT id FROM records WHERE id NOT IN (SELECT id FROM blocked_records);
SELECT COUNT(*) > 0 FROM records;\n`
}

function goodSql(): string {
  return `SELECT id FROM records LIMIT 10;
SELECT id FROM records WHERE NOT EXISTS (SELECT 1 FROM blocked_records WHERE blocked_records.id = records.id);
SELECT EXISTS (SELECT 1 FROM records);\n`
}

async function track(root: string, path: string, content: string): Promise<void> {
  const file = join(root, path)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

function check(directory: string) {
  return spawnSync(process.execPath, [cli, 'check', '--root', directory, '--format', 'json'], {
    encoding: 'utf8',
  })
}

function findings(result: { stdout: string }): Diagnostic[] {
  return JSON.parse(result.stdout).rules
}

function ruleFindings(result: { stdout: string }, rule: string): Diagnostic[] {
  return findings(result).filter(finding => finding.rule === rule)
}

function ownedFiles(diagnostics: Diagnostic[]): string[] {
  return [...new Set(diagnostics.map(diagnostic => diagnostic.file))].toSorted()
}
