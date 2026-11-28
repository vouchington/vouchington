import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ORDINARY_EXPLAIN_SHARDS } from './explain-shards.mts'
import { assertPlanRegistry } from './plan-expectations.mts'
import {
  EXPLAIN_DOMAINS,
  EXPLAIN_DOMAIN_NAMES,
  ORDINARY_SHARD_DOMAINS,
  getAssignedShardDomains,
  getDomainRunners,
  getOrderedRunners,
  parseExplainDomain,
} from './run-ordered-scenarios.mts'

const EXPLAIN_DIR = import.meta.dirname
const DOMAIN_FILE_PREFIX = 'run-ordered-scenarios-'
const DOMAIN_FILE_SUFFIX = '.mts'

describe('domain shard layout', () => {
  it('maps every domain file to EXPLAIN_DOMAINS and assigns every domain to exactly one shard', () => {
    const domainFiles = readdirSync(EXPLAIN_DIR)
      .filter(file => file.startsWith(DOMAIN_FILE_PREFIX) && file.endsWith(DOMAIN_FILE_SUFFIX))
      .map(file => file.slice(DOMAIN_FILE_PREFIX.length, -DOMAIN_FILE_SUFFIX.length))
      .toSorted()
    expect(domainFiles).toEqual(
      [...EXPLAIN_DOMAIN_NAMES.filter(name => name !== 'capacity-audit')].toSorted(),
    )

    for (const shard of ORDINARY_EXPLAIN_SHARDS)
      expect(ORDINARY_SHARD_DOMAINS[shard].length).toBeGreaterThan(0)

    const assigned = getAssignedShardDomains()
    expect(new Set(assigned).size).toBe(assigned.length)
    expect([...assigned].toSorted()).toEqual([...EXPLAIN_DOMAIN_NAMES].toSorted())
  })

  it('gives each domain a nonempty runner list and runs every domain once when unsharded', () => {
    for (const domain of EXPLAIN_DOMAIN_NAMES) {
      expect(getDomainRunners(domain).length).toBeGreaterThan(0)
      expect(parseExplainDomain(domain)).toBe(domain)
    }
    expect(parseExplainDomain(undefined)).toBeUndefined()
    expect(parseExplainDomain('')).toBeUndefined()
    expect(() => parseExplainDomain('unknown-domain')).toThrow('Invalid EXPLAIN_DOMAIN')

    const expectedAll = EXPLAIN_DOMAIN_NAMES.flatMap(domain => EXPLAIN_DOMAINS[domain])
    expect(getOrderedRunners(undefined)).toEqual(expectedAll)
  })

  it('keeps every scenario runner in at most one domain so domains only share idempotent seed helpers', () => {
    const scenarioOwners = new Map<string, string[]>()
    for (const domain of EXPLAIN_DOMAIN_NAMES) {
      const seenInDomain = new Set<string>()
      for (const runner of EXPLAIN_DOMAINS[domain]) {
        expect(seenInDomain.has(runner.name)).toBe(false)
        seenInDomain.add(runner.name)
        if (runner.name.startsWith('run'))
          scenarioOwners.set(runner.name, [...(scenarioOwners.get(runner.name) ?? []), domain])
      }
    }
    const duplicated = [...scenarioOwners].filter(([, owners]) => owners.length > 1)
    expect(duplicated).toEqual([])
  })

  it('forbids domain files from importing other domain files', () => {
    const domainFiles = readdirSync(EXPLAIN_DIR).filter(
      file => file.startsWith(DOMAIN_FILE_PREFIX) && file.endsWith(DOMAIN_FILE_SUFFIX),
    )
    const violations = domainFiles.filter(file =>
      /from ['"]\.\/run-ordered-scenarios-/.test(readFileSync(join(EXPLAIN_DIR, file), 'utf8')),
    )
    expect(violations).toEqual([])
  })

  it('forbids import-time registerScenarioContract calls so any domain file can run alone', () => {
    expect(() => assertPlanRegistry([])).not.toThrow()
  })
})
