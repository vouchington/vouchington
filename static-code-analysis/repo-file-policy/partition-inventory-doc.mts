import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  PARTITION_POLICIES,
  UNBOUNDED_UNPARTITIONED_TABLES,
} from '../../backend/data-stores/psql/schema-growth-registry.mts'

export const PARTITION_STRATEGY_DOC = 'docs/overview/architecture/partitioning-strategy.md'
export const REGISTRY_PATH = 'backend/data-stores/psql/schema-growth-registry.mts'
export const REGISTRY_START = '<!-- schema-growth-registry:start -->'
export const REGISTRY_END = '<!-- schema-growth-registry:end -->'

const PARTITION_DOC_PATHS = new Set([
  PARTITION_STRATEGY_DOC,
  'docs/overview/architecture/partition-pruning-hints.md',
])

export function isPartitionInventoryDocPath(file: string): boolean {
  return PARTITION_DOC_PATHS.has(file)
}
export const PLANNED_PARTITION_DOC_TABLES: ReadonlyMap<string, string> = new Map()
const TABLE_REFERENCE_PATTERN = /`([a-z][a-z0-9_]*)`/g
const NON_TABLE_PARTITION_REFERENCES = new Set([
  'date',
  'day',
  'hash',
  'id',
  'month',
  'pk',
  'range',
  'relation_table',
  'sk',
  'time',
  'timestamp',
  'uuid',
  'year',
])

type CheckDocumentedPartitionTablesOptions = {
  plannedPartitionDocTables?: ReadonlyMap<string, string>
}

export function renderPartitionInventory(tableNames: Iterable<string>): string {
  const rows = [...tableNames].toSorted().map(table => {
    const policy = PARTITION_POLICIES.get(table)
    return policy
      ? `| \`${table}\` | ${policy.strategy} | \`${policy.key}\` | ${policy.children} | ${policy.retentionOwner ?? 'none'} | ${policy.accessClass} |`
      : `| \`${table}\` | RANGE | migration-defined | migration-defined | none | target-scoped |`
  })
  return [
    REGISTRY_START,
    '| Table | Strategy | Key | Children | Retention owner | Access class |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    REGISTRY_END,
  ].join('\n')
}

export function inventoryDataRows(inventory: string): string[] {
  return inventory
    .split('\n')
    .filter(line => /^\s*\|\s*`/.test(line))
    .map(line => line.trim().replace(/\s*\|\s*/g, '|'))
}

export function inventoryTableNames(inventory: string): string[] {
  return inventoryDataRows(inventory).flatMap(row => {
    const table = /^\|`([a-z][a-z0-9_]*)`\|/.exec(row)?.[1]
    return table ? [table] : []
  })
}
function clauseNegatesPartitionClaim(clause: string): boolean {
  return /\bunpartitioned\b|\bnot partitioned\b|\bnot hash[- ]partitioned\b/.test(
    clause.toLowerCase(),
  )
}

function clauseClaimsPartitionedTable(clause: string): boolean {
  return /\b(?:hash|range|partitions?|partitioned|partitioning|partition-pruning|pruning)\b/.test(
    clause.toLowerCase(),
  )
}

function partitionClaimClauses(line: string): string[] {
  return line
    .split(/[,.;]|\bbut\b/i)
    .filter(clause => clauseClaimsPartitionedTable(clause) && !clauseNegatesPartitionClaim(clause))
}

function isColumnLikeReference(reference: string): boolean {
  return (
    NON_TABLE_PARTITION_REFERENCES.has(reference) ||
    reference.endsWith('_id') ||
    reference.endsWith('_at')
  )
}

function addDocumentedPartitionTable(
  tableSources: Map<string, string>,
  table: string,
  file: string,
): void {
  tableSources.set(table, tableSources.get(table) ?? file)
}

function collectDocumentedPartitionTableNames(
  tableSources: Map<string, string>,
  file: string,
  content: string,
): void {
  if (!PARTITION_DOC_PATHS.has(file)) return

  if (file === PARTITION_STRATEGY_DOC) {
    const inventory = extractPartitionInventory(content)
    if (inventory) {
      for (const table of inventoryTableNames(inventory)) {
        addDocumentedPartitionTable(tableSources, table, file)
      }
    }
  }

  const proseContent =
    file === PARTITION_STRATEGY_DOC
      ? content.replace(extractPartitionInventory(content) ?? '', '')
      : content
  for (const line of proseContent.split('\n')) {
    for (const clause of partitionClaimClauses(line)) {
      for (const match of clause.matchAll(TABLE_REFERENCE_PATTERN)) {
        if (isColumnLikeReference(match[1])) continue
        addDocumentedPartitionTable(tableSources, match[1], file)
      }
    }
  }
}

export function checkDocumentedPartitionTables(
  contentsByFile: Map<string, string>,
  partitionedTables: Set<string>,
  errors: string[],
  options: CheckDocumentedPartitionTablesOptions = {},
): void {
  const plannedPartitionDocTables =
    options.plannedPartitionDocTables ?? PLANNED_PARTITION_DOC_TABLES
  const tableSources = new Map<string, string>()
  for (const [file, content] of contentsByFile) {
    collectDocumentedPartitionTableNames(tableSources, file, content)
  }

  const backedPartitionTables = new Set([...partitionedTables, ...PARTITION_POLICIES.keys()])
  for (const table of [...tableSources.keys()].toSorted()) {
    if (backedPartitionTables.has(table)) continue
    if (plannedPartitionDocTables.has(table)) {
      const reason = plannedPartitionDocTables.get(table)?.trim()
      if (reason) continue
    }
    const file = tableSources.get(table) ?? PARTITION_STRATEGY_DOC
    errors.push(
      `::error file=${file}::${file}: partitioned table ${table} is documented but has no migration or registry-backed partition definition; add the schema source or list it in PLANNED_PARTITION_DOC_TABLES with a roadmap reason`,
    )
  }
}

export function checkPartitionInventoryDoc(
  repoRoot: string,
  strategyDoc: string,
  partitionedTables: Set<string>,
  errors: string[],
): void {
  const actual = extractPartitionInventory(strategyDoc)
  if (actual === null) {
    errors.push(
      `::error file=${PARTITION_STRATEGY_DOC}::${PARTITION_STRATEGY_DOC}: expected exactly one schema-growth inventory marker pair`,
    )
    return
  }
  const hasRegistry = existsSync(join(repoRoot, REGISTRY_PATH))
  const inventoryTables = hasRegistry ? PARTITION_POLICIES.keys() : partitionedTables
  const expected = renderPartitionInventory(inventoryTables)
  if (inventoryDataRows(actual).join('\n') !== inventoryDataRows(expected).join('\n')) {
    errors.push(
      `::error file=${PARTITION_STRATEGY_DOC}::${PARTITION_STRATEGY_DOC}: generated schema-growth inventory is stale`,
    )
  }
  for (const table of hasRegistry ? UNBOUNDED_UNPARTITIONED_TABLES.keys() : []) {
    if (strategyDoc.includes(`\`${table}\``)) continue
    errors.push(
      `::error file=${PARTITION_STRATEGY_DOC}::${PARTITION_STRATEGY_DOC}: unbounded unpartitioned table ${table} is missing from the growth inventory`,
    )
  }
}

export function extractPartitionInventory(document: string): string | null {
  if (document.split(REGISTRY_START).length !== 2 || document.split(REGISTRY_END).length !== 2) {
    return null
  }
  const start = document.indexOf(REGISTRY_START)
  const end = document.indexOf(REGISTRY_END, start)
  return document.slice(start, end + REGISTRY_END.length)
}
