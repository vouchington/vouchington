import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { createAnalyzerFixtureBudget } from '../test-helpers/analyzer-fixture-budget.mts'

const repository = fileURLToPath(new URL('../..', import.meta.url))
const cli = join(repository, 'node_modules/no-mistakes/bin/no-mistakes.js')
const runtimePath = 'backend/services/view-reads.mts'

type ViewRelation = { table: string; requireColumns: string[] }
type Rule = {
  name?: string
  rule?: string
  options?: { relations?: ViewRelation[] }
}
type Diagnostic = { file: string; message: string; rule: string }

let budget: ReturnType<typeof createAnalyzerFixtureBudget>

describe('view lookup predicate no-mistakes configuration', () => {
  const directories: string[] = []

  beforeEach(() => {
    budget = createAnalyzerFixtureBudget()
  })

  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
    )
  })

  it('covers every current nonmaterialized view exactly once with a nonempty lookup key', async () => {
    const { relations } = await configuredRule()
    const catalog = JSON.parse(
      await readFile(
        join(repository, 'backend/data-stores/psql/schema-snapshot/no-mistakes-catalog.json'),
        'utf8',
      ),
    ) as { views: Record<string, { materialized: boolean }> }
    const names = Object.entries(catalog.views)
      .filter(([name, view]) => name.startsWith('view_') && !view.materialized)
      .map(([name]) => name)

    expect(relations.map(relation => relation.table).toSorted()).toEqual(names.toSorted())
    expect(new Set(relations.map(relation => relation.table)).size).toBe(relations.length)
    for (const relation of relations) {
      expect(relation.requireColumns.length).toBeGreaterThan(0)
      expect(relation.requireColumns.every(column => column.trim().length > 0)).toBe(true)
      expect(new Set(relation.requireColumns).size).toBe(relation.requireColumns.length)
    }
  })

  it('rejects a projection-only read from every configured view', async () => {
    const rule = await configuredRule()
    const directory = await fixture(
      directories,
      rule,
      rule.relations.map(
        ({ table, requireColumns }) => `SELECT ${requireColumns[0]} FROM ${table}`,
      ),
    )

    const result = await budget.check(cli, directory)
    expect(result.status).toBe(1)
    const diagnostics = findings(result)
    expect(diagnostics).toHaveLength(
      rule.relations.reduce((count, relation) => count + relation.requireColumns.length, 0),
    )
    expect(new Set(diagnostics.map(diagnostic => diagnostic.file))).toEqual(new Set([runtimePath]))
    for (const { table } of rule.relations) {
      expect(diagnostics.some(diagnostic => diagnostic.message.includes(table))).toBe(true)
    }
  })

  it('accepts equality, ANY, and joined lookup keys for every view', async () => {
    const rule = await configuredRule()
    const statements = rule.relations.flatMap(relation => [
      equality(relation),
      anyFirstKey(relation),
      joinedKey(relation),
    ])
    const directory = await fixture(directories, rule, statements)

    const result = await budget.check(cli, directory)
    expect(result.status).toBe(0)
    expect(findings(result)).toEqual([])
  })

  it('rejects nonkey filters, ordering, limits, and every incomplete placement tuple', async () => {
    const rule = await configuredRule()
    const placement = rule.relations.find(
      relation => relation.table === 'view_publicly_projected_image_placements',
    )
    expect(placement?.requireColumns).toEqual(['placement_id', 'placement_revision', 'image_id'])
    const statements = [
      'SELECT id FROM view_community_metrics WHERE member_count > $1',
      'SELECT id FROM view_community_metrics ORDER BY id',
      'SELECT id FROM view_community_metrics LIMIT 1',
      ...placement!.requireColumns.map(
        omitted =>
          `SELECT placement_id FROM view_publicly_projected_image_placements WHERE ${placement!.requireColumns
            .filter(column => column !== omitted)
            .map((column, index) => `${column} = $${index + 1}`)
            .join(' AND ')}`,
      ),
    ]
    const directory = await fixture(directories, rule, statements)

    const result = await budget.check(cli, directory)
    expect(result.status).toBe(1)
    expect(findings(result)).toHaveLength(statements.length)
  })

  it('finds missing keys inside production transaction-typed helpers', async () => {
    const configured = await configuredRule()
    const mutations = [
      {
        path: 'backend/services/identity-verification/attempts.mts',
        marker: '    const { rows: membershipRows } =',
        probe: '    await query(sql`/* viewPredicateProbe */ SELECT id FROM view_memberships`)\n',
        relation: 'view_memberships',
      },
      {
        path: 'backend/services/oauth/authorization-exchange-recovery-ownership.mts',
        marker: '  const { rows } = await transaction<',
        probe:
          "  await transaction('/* viewPredicateProbe */ SELECT id FROM view_oauth_authorization_current_records')\n",
        relation: 'view_oauth_authorization_current_records',
      },
      {
        path: 'backend/services/oauth/authorization-exchange-state.mts',
        marker: '    await prepareOAuthAuthorizationClaim(',
        probe:
          "    await transaction('/* viewPredicateProbe */ SELECT id FROM view_oauth_authorization_current_records')\n",
        relation: 'view_oauth_authorization_current_records',
      },
    ] as const
    const sources: Record<string, string> = {}
    for (const { path, marker, probe } of mutations) {
      const source = await readFile(join(repository, path), 'utf8')
      expect(source.split(marker)).toHaveLength(2)
      sources[path] = source.replace(marker, probe + marker)
    }
    const directory = await fixture(directories, configured, [], sources)

    const result = await budget.check(cli, directory)
    expect(result.status).toBe(1)
    const diagnostics = findings(result)
    expect(diagnostics).toHaveLength(mutations.length)
    expect(
      diagnostics.every(diagnostic => diagnostic.rule === 'postgres-required-predicates'),
    ).toBe(true)
    for (const { path, relation } of mutations) {
      expect(
        diagnostics.some(
          diagnostic => diagnostic.file === path && diagnostic.message.includes(relation),
        ),
      ).toBe(true)
    }
  })
})

async function configuredRule(): Promise<{ rule: Rule; relations: ViewRelation[] }> {
  const config = parse(await readFile(join(repository, '.no-mistakes.yml'), 'utf8')) as {
    rules: Rule[]
  }
  const matches = config.rules.filter(
    rule => rule.name === 'view reads constrain their lookup keys',
  )
  expect(matches).toHaveLength(1)
  const rule = matches[0]!
  expect(rule.rule).toBe('postgres-required-predicates')
  expect(rule.options?.relations).toBeDefined()
  return { rule, relations: rule.options!.relations! }
}

async function fixture(
  directories: string[],
  configured: { rule: Rule; relations: ViewRelation[] },
  statements: string[],
  sources?: Record<string, string>,
): Promise<string> {
  const directory = await budget.createRoot('view-required-predicates-')
  directories.push(directory)
  const fixtureSources = sources ?? {
    [runtimePath]: `import { read } from '@data-stores/psql'\nexport async function run() {\n${statements
      .map(statement => `  await read(\`${statement}\`)`)
      .join('\n')}\n}\n`,
  }
  for (const [path, content] of Object.entries(fixtureSources)) {
    const file = join(directory, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content)
  }
  await writeFile(join(directory, '.no-mistakes.yml'), stringify({ rules: [configured.rule] }))
  expect(budget.git(['init', '-q', directory]).status).toBe(0)
  expect(budget.git(['-C', directory, 'add', '.']).status).toBe(0)
  return directory
}

function equality({ table, requireColumns }: ViewRelation): string {
  return `SELECT * FROM ${table} WHERE ${requireColumns
    .map((column, index) => `${column} = $${index + 1}`)
    .join(' AND ')}`
}

function anyFirstKey({ table, requireColumns }: ViewRelation): string {
  return `SELECT * FROM ${table} WHERE ${requireColumns[0]} = ANY($1::uuid[])${requireColumns
    .slice(1)
    .map((column, index) => ` AND ${column} = $${index + 2}`)
    .join('')}`
}

function joinedKey({ table, requireColumns }: ViewRelation): string {
  const selected = requireColumns.map((column, index) => `$${index + 1} AS ${column}`).join(', ')
  const joined = requireColumns
    .map(column => `view_row.${column} = selected.${column}`)
    .join(' AND ')
  return `SELECT view_row.* FROM ${table} view_row JOIN (SELECT ${selected}) selected ON ${joined}`
}

function findings(result: { stdout: string }): Diagnostic[] {
  return (JSON.parse(result.stdout) as { rules: Diagnostic[] }).rules
}
