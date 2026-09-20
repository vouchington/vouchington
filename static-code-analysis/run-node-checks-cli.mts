import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs as nodeParseArgs } from 'node:util'

import type { CheckName, CheckResult } from './node-check-types.mts'

const VALID_CHECKS = new Set<CheckName>([
  'config-inventory-policy',
  'dependency-license-policy',
  'repo-file-policy',
  'scc-complexity',
  'targeted-guardrails',
])

export function parseArgs(
  args: string[],
  defaultRepoRoot = process.cwd(),
): { checks: CheckName[]; repoRoot: string } {
  let checksCsv: string
  let repoRoot: string
  try {
    const parsed = nodeParseArgs({
      args,
      options: {
        checks: { type: 'string' },
        'repo-root': { type: 'string' },
      },
      strict: true,
    })
    checksCsv = parsed.values.checks ?? ''
    repoRoot = parsed.values['repo-root'] ?? defaultRepoRoot
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error), { cause: error })
  }

  const checks = checksCsv.split(',').flatMap(check => (check.trim() ? [check.trim()] : []))
  if (checks.length === 0) throw new Error('Usage: run-node-checks --checks <comma-list>')
  for (const check of checks) {
    if (!VALID_CHECKS.has(check as CheckName)) throw new Error(`Unknown check: ${check}`)
  }
  return { checks: checks as CheckName[], repoRoot }
}

export interface NodeChecksCliOptions {
  args: string[]
  cwd: string
  error: (value: unknown) => void
  exit: (code: number) => void
  isMain: boolean
  log: (value: unknown) => void
  run: (options: { checks: CheckName[]; repoRoot: string }) => Promise<CheckResult[]>
}

export async function runNodeChecksCli(options: NodeChecksCliOptions): Promise<void> {
  if (!options.isMain) return
  try {
    const results = await options.run(parseArgs(options.args, options.cwd))
    let failed = false
    for (const result of results) {
      for (const fix of result.fixes ?? []) options.log(`[${result.name}] fix: ${fix}`)
      for (const error of result.errors) {
        options.error(error.startsWith('::') ? error : `[${result.name}] error: ${error}`)
        failed = true
      }
      if (result.errors.length === 0) options.log(`[${result.name}] passed.`)
    }
    if (failed) options.exit(1)
  } catch (error) {
    options.error(error instanceof Error ? error.message : String(error))
    options.exit(2)
  }
}

export function isInvokedAsScript(
  argvPath = process.argv[1],
  modulePath = fileURLToPath(import.meta.url),
  canonicalize: (path: string) => string = realpathSync,
): boolean {
  if (!argvPath) return false
  try {
    return canonicalize(argvPath) === canonicalize(modulePath)
  } catch {
    return false
  }
}
