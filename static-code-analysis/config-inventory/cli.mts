#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { buildSharedContext } from 'vouchington-tooling/shared-context'
import { collectConfigInventory, formatConfigInventoryMarkdown } from './index.mts'

interface CliOptions {
  format: 'json' | 'markdown'
  help?: boolean
  repoRoot: string
}

const USAGE = 'Usage: ./dev/config-inventory [--format markdown|json] [--repo-root <path>]\n'

export function parseConfigInventoryArgs(args: string[]): CliOptions {
  let format: CliOptions['format'] = 'markdown'
  let repoRoot = process.cwd()

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--format') {
      const next = args[++i]
      if (next !== 'json' && next !== 'markdown')
        throw new Error('--format must be json or markdown')
      format = next
    } else if (arg === '--repo-root') {
      repoRoot = args[++i] ?? ''
      if (!repoRoot) throw new Error('--repo-root requires a value')
    } else if (arg === '--help' || arg === '-h') {
      return { format, help: true, repoRoot }
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return { format, repoRoot }
}

export function getConfigInventoryUsage(): string {
  return USAGE
}

export async function runConfigInventoryCli(options: CliOptions): Promise<string> {
  const ctx = await buildSharedContext(options.repoRoot)
  if (!ctx.isInsideGitRepo) throw new Error(`${options.repoRoot} is not inside a git repository`)
  const inventory = await collectConfigInventory(ctx)
  return options.format === 'json'
    ? `${JSON.stringify(inventory, null, 2)}\n`
    : formatConfigInventoryMarkdown(inventory)
}

function isInvokedAsScript(): boolean {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isInvokedAsScript()) {
  const options = parseConfigInventoryArgs(process.argv.slice(2))
  ;(options.help ? Promise.resolve(getConfigInventoryUsage()) : runConfigInventoryCli(options))
    .then(output => {
      process.stdout.write(output)
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(2)
    })
}
