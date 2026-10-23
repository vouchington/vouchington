import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import {
  directiveInventory,
  expectedCatalogOptions,
  expectedCatalogOrderingRules,
  expectedDirectiveInventory,
  scopedOrderingPaths,
  uncoveredOrderingPaths,
  type RuleOptions,
} from './postgres-ordering-policy.mts'
import { trackedFiles } from './tracked-files.mts'

type Rule = { name: string; options?: Record<string, unknown>; rule: string; scope: string }

/** Full tracked-source policy check; run once in dedicated static CI. */
export function checkPostgresOrderingPolicy(root: string): void {
  const readSource = (path: string) => readFileSync(join(root, path), 'utf8')
  const config = parseYaml(readSource('.no-mistakes.yml')) as { rules: Rule[] }
  const catalogOrderingRules = config.rules.filter(
    rule =>
      rule.options?.schemaCatalogPath === expectedCatalogOptions.schemaCatalogPath &&
      ['postgres-conflict-ordering', 'postgres-lock-ordering'].includes(rule.rule),
  )
  assert.deepEqual(catalogOrderingRules, expectedCatalogOrderingRules)

  const backendPaths = trackedFiles(root, ['backend'])
  assert.ok(backendPaths.includes(expectedCatalogOptions.schemaCatalogPath))
  const directivePaths = backendPaths.filter(
    path =>
      scopedOrderingPaths([path], {
        include: [...expectedCatalogOptions.include, ...expectedCatalogOptions.sqlInclude],
        exclude: expectedCatalogOptions.exclude,
      }).length > 0,
  )
  assert.deepEqual(directiveInventory(directivePaths, readSource), expectedDirectiveInventory)

  const [plainLocks, catalogLocks] = ['multi-row FOR UPDATE locks', 'production PostgreSQL locks']
    .map(prefix =>
      config.rules.find(
        rule => rule.rule === 'postgres-lock-ordering' && rule.name.startsWith(prefix),
      ),
    )
    .map(rule => rule?.options as RuleOptions | undefined)
  assert.ok(plainLocks, 'plain lock rule must exist')
  assert.ok(catalogLocks, 'catalog lock rule must exist')
  const plainPaths = scopedOrderingPaths(backendPaths, plainLocks)
  const catalogPaths = new Set(scopedOrderingPaths(backendPaths, catalogLocks))
  assert.ok(plainPaths.length > 0)
  assert.deepEqual(
    plainPaths.filter(path => catalogPaths.has(path)),
    [],
  )
  assert.deepEqual(uncoveredOrderingPaths(backendPaths, plainLocks, catalogLocks), [])
}

if (import.meta.main) checkPostgresOrderingPolicy(process.cwd())
