import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { RULES } from '../rules.mts'

// Scans every *-rules.mts file in the transient-retry directory.
// Convention: all rule files follow the `*-rules.mts` suffix. A file that
// doesn't use that suffix is outside the scan boundary — the convention is the
// contract.
async function collectFileExportedRules() {
  const dirUrl = new URL('..', import.meta.url)
  const ruleFiles = readdirSync(fileURLToPath(dirUrl)).filter(
    f => f.endsWith('-rules.mts') && !f.endsWith('.test.mts'),
  )

  const rules: { id: string; match: unknown }[] = []
  for (const file of ruleFiles) {
    const mod = await import(new URL(file, dirUrl).href)
    for (const v of Object.values(mod)) {
      if (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Record<string, unknown>).id === 'string' &&
        typeof (v as Record<string, unknown>).match === 'function'
      ) {
        rules.push(v as { id: string; match: unknown })
      }
    }
  }
  return rules
}

describe('RULES registry integrity', () => {
  it('every rule exported from a *-rules.mts file is wired into RULES', async () => {
    const fileExportedRules = await collectFileExportedRules()
    expect(fileExportedRules.length).toBeGreaterThan(0)
    for (const rule of fileExportedRules) {
      if (!RULES.includes(rule as (typeof RULES)[number])) {
        throw new Error(`rule "${rule.id}" is exported but missing from the RULES array`)
      }
    }
  })

  it('every rule id in RULES is unique', () => {
    const seen = new Set<string>()
    for (const rule of RULES) {
      if (seen.has(rule.id)) throw new Error(`duplicate rule id "${rule.id}"`)
      seen.add(rule.id)
    }
    expect(seen.size).toBe(RULES.length)
  })

  it('every consumer and root-cause pair is unique', () => {
    const seen = new Set<string>()
    for (const rule of RULES) {
      const key = `${rule.consumerKey}\u0000${rule.rootCauseKey}`
      if (seen.has(key)) {
        throw new Error(
          `duplicate consumer/root-cause pair "${rule.consumerKey}" / "${rule.rootCauseKey}"`,
        )
      }
      seen.add(key)
    }
    expect(seen.size).toBe(RULES.length)
  })

  it('every RULES entry has the required shape fields', () => {
    for (const rule of RULES) {
      const ctx = `rule "${rule.id}"`
      if (typeof rule.id !== 'string' || rule.id.length === 0)
        throw new Error(`${ctx}: id must be a non-empty string`)
      if (typeof rule.description !== 'string' || rule.description.length === 0)
        throw new Error(`${ctx}: description must be a non-empty string`)
      if (typeof rule.rationale !== 'string' || rule.rationale.length === 0)
        throw new Error(`${ctx}: rationale must be a non-empty string`)
      if (typeof rule.consumerKey !== 'string' || rule.consumerKey.length === 0)
        throw new Error(`${ctx}: consumerKey must be a non-empty string`)
      if (typeof rule.rootCauseKey !== 'string' || rule.rootCauseKey.length === 0)
        throw new Error(`${ctx}: rootCauseKey must be a non-empty string`)
      if (rule.consumerKey === rule.id || rule.rootCauseKey === rule.id)
        throw new Error(`${ctx}: consumerKey and rootCauseKey must describe semantic families`)
      if (typeof rule.maxAttempts !== 'number')
        throw new Error(`${ctx}: maxAttempts must be a number`)
      if (typeof rule.match !== 'function') throw new Error(`${ctx}: match must be a function`)
    }
    // At least one rule must exist to confirm the loop ran.
    expect(RULES.length).toBeGreaterThan(0)
  })
})
