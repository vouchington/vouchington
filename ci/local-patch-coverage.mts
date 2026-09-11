#!/usr/bin/env node

import { parseArgs as nodeParseArgs } from 'node:util'
import { runMergeAndCheck } from './coverage-check-gate.mts'
import { validateLocalCoverageArtifacts } from './coverage-local-provenance.mts'

interface Args {
  artifacts: string
  base: string
  head: string
  json?: string
}

function usage(): string {
  return [
    'Usage: pnpm run coverage:patch -- [--artifacts <dir>] [--base <ref>] [--head <ref>] [--json <path>]',
    '',
    'Run relevant Vitest projects with --coverage first, then run this command to verify test-project membership and preview patch coverage.',
  ].join('\n')
}

function parseCliArgs(argv: string[]): Args {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage())
    process.exit(0)
  }

  const { values } = nodeParseArgs({
    args: argv,
    options: {
      artifacts: { type: 'string' },
      base: { type: 'string' },
      head: { type: 'string' },
      json: { type: 'string' },
    },
    strict: true,
  })

  return {
    artifacts: values.artifacts ?? 'coverage',
    base: values.base ?? 'origin/main',
    head: values.head ?? 'HEAD',
    json: values.json,
  }
}

async function main(argv: string[]): Promise<number> {
  let args: Args
  try {
    args = parseCliArgs(argv)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error(usage())
    return 2
  }

  try {
    validateLocalCoverageArtifacts(args.artifacts)
    return await runMergeAndCheck({
      artifactsDir: args.artifacts,
      base: args.base,
      head: args.head,
      jsonPath: args.json,
    })
  } catch (error) {
    console.error(
      `Error executing patch coverage preview: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return 1
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)))
}
