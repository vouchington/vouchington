import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { EXISTING_RELATIONAL_STORAGE_DEBT } from './relational-storage-debt.mts'

export const RELATIONAL_STORAGE_DEBT_PATH =
  'static-code-analysis/repo-file-policy/relational-storage-debt.mts'

const DEBT_KEY = /'([a-z0-9_]+\.[a-z0-9_]+)'/gu

export function quotedDebtKeys(source: string): string[] {
  const start = source.indexOf('EXISTING_RELATIONAL_STORAGE_DEBT')
  const body = start === -1 ? source : source.slice(start)
  return [...body.matchAll(DEBT_KEY)].map(match => match[1] ?? '')
}

export function currentDebtKeys(): string[] {
  return [
    ...EXISTING_RELATIONAL_STORAGE_DEBT.json,
    ...EXISTING_RELATIONAL_STORAGE_DEBT.uuidArray,
    ...EXISTING_RELATIONAL_STORAGE_DEBT.missingForeignKey,
    ...EXISTING_RELATIONAL_STORAGE_DEBT.encodedReference,
  ]
}

function debtDiagnostic(message: string): string {
  return `::error file=${RELATIONAL_STORAGE_DEBT_PATH}::${message}`
}

/** Reject inventory growth against origin/main while the remediation catalog is retired. */
export function checkRelationalStorageDebtShrinkOnly(repoRoot: string): string[] {
  const debtFile = join(repoRoot, RELATIONAL_STORAGE_DEBT_PATH)
  if (!existsSync(debtFile)) return []
  let baselineSource: string
  try {
    baselineSource = execFileSync(
      'git',
      ['-C', repoRoot, 'show', `origin/main:${RELATIONAL_STORAGE_DEBT_PATH}`],
      { encoding: 'utf8' },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return [debtDiagnostic(`could not read the origin/main remediation inventory (${message})`)]
  }
  const baseline = new Set(quotedDebtKeys(baselineSource))
  const current = new Set(quotedDebtKeys(readFileSync(debtFile, 'utf8')))
  const loadedDebt = fileURLToPath(new URL('./relational-storage-debt.mts', import.meta.url))
  if (realpathSync(debtFile) === realpathSync(loadedDebt)) {
    for (const key of currentDebtKeys()) current.add(key)
  }
  const errors: string[] = []
  for (const key of current) {
    if (baseline.has(key)) continue
    errors.push(
      debtDiagnostic(
        `${key}: new relational storage debt is rejected while the inventory is retired`,
      ),
    )
  }
  return errors
}
