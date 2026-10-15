import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it } from 'vitest'
import { createAnalyzerFixtureBudget } from '../test-helpers/analyzer-fixture-budget.mts'
import { parse, stringify } from 'yaml'

let budget: ReturnType<typeof createAnalyzerFixtureBudget>

const repository = fileURLToPath(new URL('../..', import.meta.url))
const cli = join(repository, 'node_modules/no-mistakes/bin/no-mistakes.js')
const ruleIds = [
  'postgres-require-query-annotation',
  'postgres-no-offset',
  'postgres-lock-ordering',
  'postgres-no-generated-column-writes',
]
const paths = [
  'backend/services/queries.mts',
  'backend/scripts/runtime.mts',
  'backend/test-helpers/entities/users-direct.mts',
]

type Rule = { rule?: string }
type Finding = { rule: string; line: number }

// Exercise actual configuration through the released analyzer: opting out of
// opaque-SQL diagnostics must preserve ordinary, recoverable SQL violations.
describe('opaque SQL policy', () => {
  beforeEach(() => {
    budget = createAnalyzerFixtureBudget()
  })
  it('preserves known violations and accepts safe or unrecoverable statements', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opaque-sql-policy-'))
    try {
      const config = parse(await readFile(join(repository, '.no-mistakes.yml'), 'utf8')) as {
        rules: Rule[]
      }
      const rules = config.rules.filter(rule => ruleIds.includes(rule.rule ?? ''))
      await writeFile(join(root, '.no-mistakes.yml'), stringify({ rules }))
      const catalogPath = 'backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json'
      await track(root, catalogPath, await readFile(join(repository, catalogPath), 'utf8'))
      await track(
        root,
        'backend/data-stores/psql/migrations/0999.sql',
        'CREATE TABLE widgets (id integer PRIMARY KEY, calculated integer GENERATED ALWAYS AS (id + 1) STORED, updated_at timestamptz);',
      )
      for (const path of paths) await track(root, path, source(true))
      expect(budget.git(['init', '-q', root]).status).toBe(0)
      expect(budget.git(['-C', root, 'add', '.']).status).toBe(0)

      const rejected = await check(root)
      expect(rejected.status).toBe(1)
      const findings = (JSON.parse(rejected.stdout) as { rules: Finding[] }).rules
      expect(new Set(findings.map(finding => finding.rule))).toEqual(new Set(ruleIds))
      expect(findings.every(finding => finding.line >= 4 && finding.line <= 8)).toBe(true)

      for (const path of paths) await track(root, path, source(false))
      const accepted = await check(root)
      expect(accepted.status).toBe(0)
      expect((JSON.parse(accepted.stdout) as { rules: Finding[] }).rules).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function source(includeViolations: boolean): string {
  const violations = includeViolations
    ? [
        " read('SELECT id FROM widgets');",
        " read('/* badPage */ SELECT id FROM widgets OFFSET 1');",
        " read('/* badLock */ SELECT id FROM widgets WHERE id = ANY($1) FOR UPDATE');",
        " read('/* badInsert */ INSERT INTO widgets (calculated) VALUES (1)');",
        " read('/* badUpdate */ UPDATE widgets SET calculated = 1');",
      ]
    : []
  return [
    "import { read } from '@data-stores/psql';",
    'export function cases(opaque: unknown) {',
    ' read(opaque);',
    ...violations,
    " read('/* safePage */ SELECT id FROM widgets WHERE id > $1 ORDER BY id LIMIT 2');",
    " read('/* safeLock */ SELECT id FROM widgets WHERE id = ANY($1) ORDER BY id FOR UPDATE SKIP LOCKED');",
    " read('/* safeInsert */ INSERT INTO widgets (id) VALUES (1)');",
    '}',
  ].join('\n')
}

async function track(root: string, path: string, content: string): Promise<void> {
  const file = join(root, path)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

function check(root: string) {
  return budget.check(cli, root)
}
