#!/usr/bin/env node

import { buildRows, countFiles, formatRows } from './cloc/lib.mts'

async function main(): Promise<void> {
  const rows = buildRows(await countFiles())
  process.stdout.write(`${formatRows(rows)}\n`)
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
