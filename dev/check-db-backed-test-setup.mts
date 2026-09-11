#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import {
  collectDbBackedTestSetupInput,
  hasDataStoreInit,
  hasValkeyConfiguration,
} from './check-db-backed-test-setup/probes.mts'
import type { DbBackedTestSetupInput } from './check-db-backed-test-setup/types.mts'

export { collectDbBackedTestSetupInput } from './check-db-backed-test-setup/probes.mts'
export type { DbBackedTestSetupInput }

export type DbBackedTestSetupResult = {
  errors: string[]
  ok: boolean
}

const defaultDatabaseName = 'voucha'
const initializeWebHint =
  'Run ./dev/initialize backend (or web), then source .env before rerunning DB/Valkey-backed tests.'
const staleSchemaHint =
  'Run ./dev/initialize backend (or web) first; if the schema is still stale in this non-main worktree, run ./dev/reset, then source .env before rerunning DB/Valkey-backed tests.'
const staleWorktreeHint =
  'Run ./dev/initialize backend (or web), then source .env from this worktree before rerunning DB/Valkey-backed tests.'

export function evaluateDbBackedTestSetup(input: DbBackedTestSetupInput): DbBackedTestSetupResult {
  const errors: string[] = []

  if (input.env.CI) {
    return { errors, ok: true }
  }

  if (input.identityProbe?.checked && !input.identityProbe.ok) {
    errors.push(
      `Worktree resource identity is unavailable: ${input.identityProbe.message ?? 'identity probe failed'}. Refusing DB/Valkey-backed test setup diagnostics.`,
    )
    return { errors, ok: false }
  }

  if (!input.files.initialized && !input.files.env) {
    errors.push(`worktree is not initialized. ${initializeWebHint}`)
  }

  if (!hasDataStoreInit(input.initializedMode)) {
    const mode = input.initializedMode ?? 'missing'
    errors.push(
      `DB/Valkey-backed tests require backend or web initialization; current .initialized mode is "${mode}". ${initializeWebHint}`,
    )
  }

  if (!input.files.env) {
    errors.push(`.env is missing. ${initializeWebHint}`)
  }

  const databaseUrl = input.env.DATABASE_URL
  if (!databaseUrl) {
    errors.push(`DATABASE_URL is not set in the current shell. ${initializeWebHint}`)
  } else if (!input.isMainWorktree && databaseNameFromUrl(databaseUrl) === defaultDatabaseName) {
    errors.push(
      `DATABASE_URL points at the main worktree database "${defaultDatabaseName}" from a non-main worktree. ${initializeWebHint}`,
    )
  }

  if (!hasValkeyConfiguration(input.env)) {
    errors.push(`Valkey environment variables are not set. ${initializeWebHint}`)
  }

  const currentWorktreeDir = input.worktreeDir
  const envWorktreeDir = input.env.WORKTREE_DIR
  if (!envWorktreeDir) {
    errors.push(`WORKTREE_DIR is not set in the current shell. ${staleWorktreeHint}`)
  } else if (envWorktreeDir !== currentWorktreeDir) {
    errors.push(
      `WORKTREE_DIR points at "${envWorktreeDir}" but this worktree is "${currentWorktreeDir}". ${staleWorktreeHint}`,
    )
  }

  if (input.databaseProbe?.checked && !input.databaseProbe.ok) {
    errors.push(
      `PostgreSQL is not reachable: ${input.databaseProbe.message ?? 'probe failed'}. ${initializeWebHint}`,
    )
  }

  if (input.valkeyProbe?.checked && !input.valkeyProbe.ok) {
    errors.push(
      `Valkey is not reachable: ${input.valkeyProbe.message ?? 'probe failed'}. ${initializeWebHint}`,
    )
  }

  if (input.schemaProbe?.checked && !input.schemaProbe.ok) {
    errors.push(
      `PostgreSQL schema looks stale: ${input.schemaProbe.message ?? 'schema probe failed'}. ${staleSchemaHint}`,
    )
  }

  return { errors, ok: errors.length === 0 }
}

export function databaseNameFromUrl(databaseUrl: string): string | null {
  try {
    const url = new URL(databaseUrl)
    return decodeURIComponent(url.pathname.replace(/^\//, '')) || null
  } catch {
    return null
  }
}

function main() {
  const result = evaluateDbBackedTestSetup(collectDbBackedTestSetupInput())
  if (result.ok) {
    return
  }

  process.stderr.write('Error: DB/Valkey-backed test setup is not ready.\n')
  for (const error of result.errors) {
    process.stderr.write(`- ${error}\n`)
  }
  process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
