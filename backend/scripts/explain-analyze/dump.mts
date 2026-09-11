//
// Dumps the latest EXPLAIN ANALYZE results in a text format suitable for LLM analysis.
//
// Usage:
//   pnpm run explain:dump                          # print to stdout
//   pnpm run explain:dump | your-llm-cli -p "analyze..." # replace 'your-llm-cli' with your actual LLM CLI
//
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExplainResult } from '@data-stores/psql'

const OUTPUT_DIR = join(import.meta.dirname, 'output')

function formatPlan(plan: unknown, indent = 0): string {
  if (typeof plan !== 'object' || plan === null) return String(plan)

  const node = plan as Record<string, unknown>
  const lines: string[] = []
  const pad = '  '.repeat(indent)

  const nodeType = node['Node Type'] as string | undefined
  if (nodeType) {
    const relation = node['Relation Name'] ? ` on ${node['Relation Name']}` : ''
    const alias =
      node['Alias'] && node['Alias'] !== node['Relation Name'] ? ` (${node['Alias']})` : ''
    const rows = `rows=${node['Actual Rows'] ?? '?'} (est. ${node['Plan Rows'] ?? '?'})`
    const cost = `cost=${(node['Total Cost'] as number)?.toFixed(1) ?? '?'}`
    const time = node['Actual Total Time']
      ? `time=${(node['Actual Total Time'] as number).toFixed(1)}ms`
      : ''
    lines.push(`${pad}${nodeType}${relation}${alias}  ${rows}  ${cost}  ${time}`)

    // Show key details
    if (node['Index Name']) lines.push(`${pad}  Index: ${node['Index Name']}`)
    if (node['Index Cond']) lines.push(`${pad}  Index Cond: ${node['Index Cond']}`)
    if (node['Filter']) lines.push(`${pad}  Filter: ${node['Filter']}`)
    if (node['Join Filter']) lines.push(`${pad}  Join Filter: ${node['Join Filter']}`)
    if (node['Hash Cond']) lines.push(`${pad}  Hash Cond: ${node['Hash Cond']}`)
    if (node['Merge Cond']) lines.push(`${pad}  Merge Cond: ${node['Merge Cond']}`)
    if (node['Sort Key'])
      lines.push(`${pad}  Sort Key: ${(node['Sort Key'] as string[]).join(', ')}`)
    if (node['Group Key'])
      lines.push(`${pad}  Group Key: ${(node['Group Key'] as string[]).join(', ')}`)
    if (node['Rows Removed by Filter'])
      lines.push(`${pad}  Rows Removed by Filter: ${node['Rows Removed by Filter']}`)
    if (node['Rows Removed by Join Filter'])
      lines.push(`${pad}  Rows Removed by Join Filter: ${node['Rows Removed by Join Filter']}`)
    if (node['Shared Hit Blocks'])
      lines.push(
        `${pad}  Buffers: shared hit=${node['Shared Hit Blocks']}${node['Shared Read Blocks'] ? ` read=${node['Shared Read Blocks']}` : ''}`,
      )
  }

  const plans = node['Plans'] as Record<string, unknown>[] | undefined
  if (Array.isArray(plans)) {
    for (const child of plans) {
      lines.push(formatPlan(child, indent + 1))
    }
  }

  // Top-level wrapper
  const topPlan = node['Plan'] as Record<string, unknown> | undefined
  if (topPlan && typeof topPlan === 'object' && !nodeType) {
    lines.push(formatPlan(topPlan, indent))
  }

  return lines.join('\n')
}

function main() {
  let files: string[]
  try {
    files = readdirSync(OUTPUT_DIR)
      .filter(f => f.startsWith('results-') && f.endsWith('.json'))
      .toSorted()
      .toReversed()
  } catch {
    console.error(`No output directory found at ${OUTPUT_DIR}. Run explain:run first.`)
    process.exit(1)
  }

  if (files.length === 0) {
    console.error('No result files found. Run explain:run first.')
    process.exit(1)
  }

  const latest = files[0]
  const filePath = join(OUTPUT_DIR, latest)
  console.error(`Reading: ${filePath}`)

  const results = JSON.parse(readFileSync(filePath, 'utf8')) as ExplainResult[]

  console.log(`# EXPLAIN ANALYZE Results (${results.length} queries)`)
  console.log(`# Source: ${latest}\n`)

  for (const r of results) {
    console.log('='.repeat(80))
    console.log(`Query: ${r.name}`)
    console.log(
      `Execution: ${r.execution_time_ms.toFixed(1)}ms  Planning: ${r.planning_time_ms.toFixed(1)}ms`,
    )
    console.log(`\nSQL:\n${r.query_text}\n`)
    console.log(`Plan:`)
    console.log(formatPlan(r.plan))
    console.log('')
  }

  process.exitCode = 0
}

main()
