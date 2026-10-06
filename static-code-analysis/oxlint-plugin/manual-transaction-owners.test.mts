import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const RULE = 'no-mistakes/postgres-no-manual-transaction'
const CONFIG_DRIVEN_STATEMENTS =
  'backend/data-stores/psql/migration-runner/config-driven-statements.mts'
const EXPECTED_CONFIGS = [
  '.oxlintrc.json',
  'backend/agents/.oxlintrc.json',
  'backend/scripts/.oxlintrc.json',
  'backend/services/crawler-rss/.oxlintrc.json',
  'backend/test-helpers/entities/.oxlintrc.json',
]
const EXPECTED_OWNERS = [
  'backend/data-stores/psql/explain-analyze.mts',
  CONFIG_DRIVEN_STATEMENTS,
  'backend/test-helpers/postgres-advisory-lock.mts',
  'backend/test-helpers/crawl-urls-queue-lock.mts',
  'backend/test-helpers/entities/moderation-transparency-date-reservation.mts',
]
const OWNED_TRANSACTION_CALLS = [
  "await writer('/* runConfigDrivenStatementsInTransaction */ BEGIN')",
  "await writer('/* runConfigDrivenStatementsInTransaction */ COMMIT')",
  "await writer('/* runConfigDrivenStatementsInTransaction */ ROLLBACK')",
]

interface OxlintConfig {
  rules?: Record<string, unknown>
  overrides?: Array<{ rules?: Record<string, unknown> }>
}

function trackedOxlintConfigs(): string[] {
  const tracked = spawnSync('git', ['ls-files', '-z', '.oxlintrc*.json', '**/.oxlintrc*.json'], {
    encoding: 'utf8',
  })
  expect(tracked.status).toBe(0)
  return tracked.stdout
    .split('\0')
    .filter(path => /(?:^|\/)\.oxlintrc(?:\.[^/]+)?\.json$/.test(path))
}

function ownerLists(config: OxlintConfig): string[][] {
  const settings = [
    config.rules?.[RULE],
    ...(config.overrides ?? []).map(override => override.rules?.[RULE]),
  ]
  return settings.flatMap(setting => {
    if (!Array.isArray(setting) || setting.length < 2) return []
    const options = setting[1]
    if (typeof options !== 'object' || options === null || !('owners' in options)) return []
    const owners = options.owners
    if (!Array.isArray(owners) || owners.some(owner => typeof owner !== 'string')) {
      throw new Error(`${RULE} owners must be a string array`)
    }
    return [owners]
  })
}

function readConfig(path: string): OxlintConfig {
  const parsed = ts.readConfigFile(resolve(path), ts.sys.readFile)
  if (parsed.error) throw new Error(`Cannot parse ${path}`)
  return parsed.config as OxlintConfig
}

describe('postgres-no-manual-transaction owners', () => {
  it('lists the config-driven statement helper on every copied owner allowlist', () => {
    const declared = new Map<string, string[][]>()
    for (const path of trackedOxlintConfigs()) {
      const lists = ownerLists(readConfig(path))
      if (lists.length > 0) declared.set(path, lists)
    }

    expect([...declared.keys()].toSorted()).toEqual([...EXPECTED_CONFIGS].toSorted())
    for (const lists of declared.values()) {
      expect(lists).toEqual([EXPECTED_OWNERS])
    }
  })

  it('keeps the allowlist tied to the helper that opens those transactions', () => {
    const source = readFileSync(resolve(CONFIG_DRIVEN_STATEMENTS), 'utf8')
    for (const call of OWNED_TRANSACTION_CALLS) {
      expect(source).toContain(call)
    }
  })
})
