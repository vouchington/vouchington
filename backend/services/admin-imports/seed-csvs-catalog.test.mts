import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsvRows } from '@modules/csv'
import { readSeedCsvRows } from './seed-csvs.mts'
import { validateTopicHeaders, validateTopicRows } from './validate-topics.mts'

const SEED_DIR = join(import.meta.dirname, '..', '..', '..', 'seed')

type SeedCsvFileHeaders = { file: string; headers: string[] }

function readSeedCsvFileHeaders(): SeedCsvFileHeaders[] {
  return readdirSync(SEED_DIR)
    .filter(f => f.endsWith('-topics.csv'))
    .sort()
    .map(file => {
      const rows = parseCsvRows(readFileSync(join(SEED_DIR, file), 'utf-8'))
      return { file, headers: rows[0] ? Object.keys(rows[0]) : [] }
    })
}

// Pure parse/validate coverage over the shipped seed/*-topics.csv files — no DB writes, so this
// runs as an ordinary parallel backend-data-stores file. It checks the catalog is well-formed;
// seed-csvs.test.mts separately checks that the importer itself behaves correctly on a fixture.
// Row-level checks below drive `readSeedCsvRows()` directly (the same reader the importer uses),
// so this validates exactly what `seedTopicsFromCsvs()` will receive, not a parallel reimplementation.
describe('seed CSV catalog validity', () => {
  const files = readSeedCsvFileHeaders()

  it('ships at least one topics CSV', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map(f => f.file))('%s uses only allowed columns', file => {
    const csvFile = files.find(f => f.file === file)!
    expect(validateTopicHeaders(csvFile.headers)).toEqual([])
  })

  it('every row across the catalog passes topic row validation', () => {
    const allRows = readSeedCsvRows()
    const result = validateTopicRows(allRows)
    const invalid = result.rows.filter(row => !row.valid)
    expect(invalid).toEqual([])
  })

  it('every parent_slugs and referral_company_slug reference resolves within the catalog', () => {
    const allRows = readSeedCsvRows()
    const knownSlugs = new Set(allRows.flatMap(row => (row.slug?.trim() ? [row.slug.trim()] : [])))

    const unresolved = allRows.flatMap(row => {
      const missing: string[] = []
      const parentSlugs = row.parent_slugs?.trim()
        ? row.parent_slugs.split('|').flatMap(slug => (slug.trim() ? [slug.trim()] : []))
        : []
      for (const parentSlug of parentSlugs) {
        if (!knownSlugs.has(parentSlug)) {
          missing.push(`${row.slug?.trim() || 'row'}: parent_slugs -> "${parentSlug}"`)
        }
      }
      const companySlug = row.referral_company_slug?.trim()
      if (companySlug && !knownSlugs.has(companySlug)) {
        missing.push(`${row.slug?.trim() || 'row'}: referral_company_slug -> "${companySlug}"`)
      }
      return missing
    })

    expect(unresolved).toEqual([])
  })
})
