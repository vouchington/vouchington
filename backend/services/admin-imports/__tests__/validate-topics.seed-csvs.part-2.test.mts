import { describe, it, expect } from 'vitest'

import { readFileSync, readdirSync } from 'node:fs'

import { join } from 'node:path'

import { parseCsvRows } from '@modules/csv'

import { validateTopicRows, validateTopicHeaders } from '../validate-topics.mts'

import { isSlug, isHttpUrlWithoutFragment } from '@modules/utils'

import { topicTypes } from '@voucha/types/entities/topic'

const VALID_SEED_FEED_TYPES = new Set(['article', 'podcast', 'video', 'mixed'])

const SEED_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'seed')

const VALID_TOPIC_TYPES = new Set(Object.keys(topicTypes))

const VALID_EXTENSIONS = new Set(['spending_category', 'retailer'])

function readCsv(filename: string): Record<string, string>[] {
  const content = readFileSync(join(SEED_DIR, filename), 'utf-8')
  return parseCsvRows(content)
}

const topicFiles = readdirSync(SEED_DIR)
  .filter(f => f.endsWith('-topics.csv'))
  .sort()

const allTopics = new Map<string, { file: string; rows: Record<string, string>[] }>()

for (const file of topicFiles) {
  allTopics.set(file, { file, rows: readCsv(file) })
}

const globalSlugs = new Set<string>()

for (const { rows } of allTopics.values()) {
  for (const row of rows) {
    globalSlugs.add(row.slug)
  }
}

describe('seed CSV validation', () => {
  describe('cross-file integrity', () => {
    it('all slugs are globally unique across all topic files', () => {
      const slugToFile = new Map<string, string>()
      const duplicates: string[] = []

      for (const [file, { rows }] of allTopics) {
        for (const row of rows) {
          const existing = slugToFile.get(row.slug)
          if (existing) {
            duplicates.push(`"${row.slug}" in both ${existing} and ${file}`)
          } else {
            slugToFile.set(row.slug, file)
          }
        }
      }

      expect(duplicates).toEqual([])
    })

    it('no alias collides with a different topic slug', () => {
      const collisions: string[] = []
      for (const { rows } of allTopics.values()) {
        for (const row of rows) {
          if (!row.aliases) continue
          const aliases = row.aliases.split('|').filter(Boolean)
          for (const alias of aliases) {
            const lower = alias.toLowerCase()
            if (globalSlugs.has(lower) && lower !== row.slug) {
              collisions.push(`alias "${alias}" of "${row.slug}" collides with slug "${lower}"`)
            }
          }
        }
      }

      expect(collisions).toEqual([])
    })

    it('total topic count is comprehensive', () => {
      let total = 0
      for (const { rows } of allTopics.values()) {
        total += rows.length
      }
      expect(total).toBeGreaterThanOrEqual(300)
    })

    it('total feed count is comprehensive', () => {
      let total = 0
      for (const { rows } of allTopics.values()) {
        for (const row of rows) {
          if (row.rss_feed_url) total++
        }
      }
      expect(total).toBeGreaterThanOrEqual(70)
    })

    it('all referral_validation_slugs are globally unique', () => {
      const seen = new Map<string, string>()
      const duplicates: string[] = []

      for (const [file, { rows }] of allTopics) {
        for (const row of rows) {
          const slug = row.referral_validation_slug?.trim()
          if (!slug) continue
          const existing = seen.get(slug)
          if (existing) {
            duplicates.push(`"${slug}" in both ${existing} and ${file}`)
          } else {
            seen.set(slug, file)
          }
        }
      }

      expect(duplicates).toEqual([])
    })

    it('referral_company_slug references a valid slug in globalSlugs', () => {
      const invalid: string[] = []

      for (const [file, { rows }] of allTopics) {
        for (const row of rows) {
          const companySlug = row.referral_company_slug?.trim()
          if (!companySlug) continue
          if (!globalSlugs.has(companySlug)) {
            invalid.push(
              `referral_company_slug "${companySlug}" for "${row.slug}" in ${file} not found in any topic CSV`,
            )
          }
        }
      }

      expect(invalid).toEqual([])
    })

    it('referral program names end with "Referral Program"', () => {
      const violations: string[] = []

      for (const [file, { rows }] of allTopics) {
        for (const row of rows) {
          if (row.topic_type !== 'referral_program') continue
          if (!row.name.trim().endsWith('Referral Program')) {
            violations.push(
              `"${row.slug}" in ${file}: name "${row.name}" does not end with "Referral Program"`,
            )
          }
        }
      }

      expect(violations).toEqual([])
    })

    it('rss_feed topics must have parent_slugs', () => {
      const violations: string[] = []

      for (const [file, { rows }] of allTopics) {
        for (const row of rows) {
          if (row.topic_type !== 'rss_feed') continue
          if (!row.parent_slugs?.trim()) {
            violations.push(`"${row.slug}" in ${file}: rss_feed topic missing parent_slugs`)
          }
        }
      }

      expect(violations).toEqual([])
    })

    it('rss_feed topics must have rss_feed_url and rss_feed_title', () => {
      const violations: string[] = []

      for (const [file, { rows }] of allTopics) {
        for (const row of rows) {
          if (row.topic_type !== 'rss_feed') continue
          if (!row.rss_feed_url?.trim()) {
            violations.push(`"${row.slug}" in ${file}: rss_feed topic missing rss_feed_url`)
          }
          if (!row.rss_feed_title?.trim()) {
            violations.push(`"${row.slug}" in ${file}: rss_feed topic missing rss_feed_title`)
          }
        }
      }

      expect(violations).toEqual([])
    })

    it('rss_feed topic names must not already contain a URL suffix', () => {
      const violations: string[] = []

      for (const [file, { rows }] of allTopics) {
        for (const row of rows) {
          if (row.topic_type !== 'rss_feed') continue
          const name = (row.name as string | undefined)?.trim()
          if (name && /\(https?:\/\//.test(name)) {
            violations.push(
              `"${row.slug}" in ${file}: name "${name}" already contains a URL suffix — use the base title only`,
            )
          }
        }
      }

      expect(violations).toEqual([])
    })

    it('feed_type for rss_feed topics must be valid when present', () => {
      const VALID_FEED_TYPES = VALID_SEED_FEED_TYPES
      const violations: string[] = []

      for (const [file, { rows }] of allTopics) {
        for (const row of rows) {
          const feedType = row.feed_type?.trim()
          if (!feedType) continue
          if (row.topic_type !== 'rss_feed') {
            violations.push(
              `"${row.slug}" in ${file}: feed_type "${feedType}" set on non-rss_feed topic (type=${row.topic_type})`,
            )
          } else if (!VALID_FEED_TYPES.has(feedType)) {
            violations.push(
              `"${row.slug}" in ${file}: feed_type "${feedType}" is not valid — must be one of: ${[...VALID_FEED_TYPES].join(', ')}`,
            )
          }
        }
      }

      expect(violations).toEqual([])
    })

    it('rss_feed parent topics must not be another rss_feed', () => {
      const slugToType = new Map<string, string>()
      for (const { rows } of allTopics.values()) {
        for (const row of rows) {
          slugToType.set(row.slug, row.topic_type)
        }
      }

      const violations: string[] = []

      for (const [file, { rows }] of allTopics) {
        for (const row of rows) {
          if (row.topic_type !== 'rss_feed') continue
          if (!row.parent_slugs) continue
          const parents = row.parent_slugs.split('|').filter(Boolean)
          for (const parent of parents) {
            const parentType = slugToType.get(parent)
            if (parentType === 'rss_feed') {
              violations.push(
                `"${row.slug}" in ${file}: parent "${parent}" is also rss_feed — rss_feed topics cannot have rss_feed parents`,
              )
            }
          }
        }
      }

      expect(violations).toEqual([])
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof VALID_TOPIC_TYPES)
  void (0 as unknown as typeof VALID_EXTENSIONS)
  // keep generated shard import bindings live for typecheck
  void (0 as unknown as typeof validateTopicRows)
  void (0 as unknown as typeof validateTopicHeaders)
  void (0 as unknown as typeof isSlug)
  void (0 as unknown as typeof isHttpUrlWithoutFragment)
})
