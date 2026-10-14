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

type Rule = { rule?: string }
type Diagnostic = { file: string; rule: string }

describe('query annotation no-mistakes configuration', () => {
  beforeEach(() => {
    budget = createAnalyzerFixtureBudget()
  })
  it('covers runtime scripts and helpers while preserving annotation exclusions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'query-annotation-scope-'))
    const covered = [
      'backend/services/query.mts',
      'backend/services/conditional-var.mts',
      'backend/scripts/runtime.mts',
      'backend/test-helpers/entities/create-test-entities.mts',
      'backend/test-helpers/entities/rss-feeds.mts',
      'backend/test-helpers/entities/topics/core.mts',
      'backend/test-helpers/entities/urls.mts',
      'backend/test-helpers/entities/users-direct.mts',
    ]
    const excluded = [
      'backend/scripts/seeds/seed.mts',
      'backend/data-stores/psql/migration-runner/run.mts',
      'backend/services/query.test.mts',
      'backend/services/__tests__/query.mts',
      'backend/test-helpers/other.mts',
    ]
    try {
      const config = parse(await readFile(join(repository, '.no-mistakes.yml'), 'utf8')) as {
        rules: Rule[]
      }
      const rules = config.rules.filter(rule => rule.rule === 'postgres-require-query-annotation')
      expect(rules).toHaveLength(2)
      await writeFile(join(root, '.no-mistakes.yml'), stringify({ rules }))
      for (const file of [...covered, ...excluded]) await fixture(root, file, false)
      expect(budget.git(['init', '-q', root]).status).toBe(0)
      expect(budget.git(['-C', root, 'add', '.']).status).toBe(0)

      const rejected = await check(root)
      expect(rejected.status).toBe(1)
      const findings = (JSON.parse(rejected.stdout) as { rules: Diagnostic[] }).rules
      expect(findings.map(finding => finding.file).toSorted()).toEqual(covered.toSorted())
      expect(new Set(findings.map(finding => finding.rule))).toEqual(
        new Set(['postgres-require-query-annotation']),
      )

      for (const file of covered) await fixture(root, file, true)
      const accepted = await check(root)
      expect(accepted.status).toBe(0)
      expect((JSON.parse(accepted.stdout) as { rules: Diagnostic[] }).rules).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

async function fixture(root: string, file: string, annotated: boolean): Promise<void> {
  await mkdir(dirname(join(root, file)), { recursive: true })
  const sql = `${annotated ? '/* runtime-query */ ' : ''}SELECT 1`
  const query = file.endsWith('/conditional-var.mts')
    ? `export function run(enabled: boolean) {\n  if (enabled) { var sql = '${sql}' }\n  return read(sql)\n}\n`
    : `await read('${sql}')\n`
  await writeFile(join(root, file), `import { read } from '@data-stores/psql'\n${query}`)
}

function check(root: string) {
  return budget.check(cli, root)
}
