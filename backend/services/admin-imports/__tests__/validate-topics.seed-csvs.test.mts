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
  it('has at least 8 topic files', () => {
    expect(topicFiles.length).toBeGreaterThanOrEqual(8)
  })

  describe.each(topicFiles)('%s', file => {
    const { rows } = allTopics.get(file)!

    it('has rows', () => {
      expect(rows.length).toBeGreaterThan(0)
    })

    it('has required columns', () => {
      const columns = Object.keys(rows[0])
      expect(columns).toContain('name')
      expect(columns).toContain('slug')
      expect(columns).toContain('topic_type')
    })

    it('headers pass import system validation', () => {
      const headers = Object.keys(rows[0])
      const unknown = validateTopicHeaders(headers)
      expect(unknown).toEqual([])
    })

    it('all slugs are valid', () => {
      const failures: string[] = []
      for (const row of rows) {
        if (!isSlug(row.slug)) failures.push(`slug "${row.slug}" is invalid`)
      }
      expect(failures).toEqual([])
    })

    it('all slugs are unique within the file', () => {
      const slugs = rows.map(r => r.slug)
      const duplicates = slugs.filter((s, i) => slugs.indexOf(s) !== i)
      expect(duplicates).toEqual([])
    })

    it('all names are non-empty and under 200 chars', () => {
      for (const row of rows) {
        const name = row.name.trim()
        expect(name.length).toBeGreaterThan(0)
        expect(name.length).toBeLessThanOrEqual(200)
      }
    })

    it('all topic_type values are valid', () => {
      for (const row of rows) {
        expect(VALID_TOPIC_TYPES.has(row.topic_type)).toBe(true)
      }
    })

    it('all parent_slugs reference valid slugs', () => {
      for (const row of rows) {
        if (!row.parent_slugs) continue
        const parents = row.parent_slugs.split('|').filter(Boolean)
        for (const parent of parents) {
          expect(globalSlugs.has(parent)).toBe(true)
        }
      }
    })

    it('all extensions are valid', () => {
      for (const row of rows) {
        if (!row.extensions) continue
        const extensions = row.extensions.split('|').filter(Boolean)
        for (const ext of extensions) {
          expect(VALID_EXTENSIONS.has(ext)).toBe(true)
        }
      }
    })

    it('all rss_feed_urls are valid when present', () => {
      for (const row of rows) {
        if (!row.rss_feed_url) continue
        expect(isHttpUrlWithoutFragment(row.rss_feed_url)).toBe(true)
      }
    })

    it('rss_feed_url and rss_feed_title are paired', () => {
      const violations: string[] = []
      for (const row of rows) {
        if (row.rss_feed_url && !row.rss_feed_title) {
          violations.push(`slug "${row.slug}" has rss_feed_url but no rss_feed_title`)
        }
        if (row.rss_feed_title && !row.rss_feed_url) {
          violations.push(`slug "${row.slug}" has rss_feed_title but no rss_feed_url`)
        }
      }
      expect(violations).toEqual([])
    })

    it('only rss_feed topics have rss_feed_url or rss_feed_title', () => {
      const violations: string[] = []
      for (const row of rows) {
        if (row.topic_type !== 'rss_feed') {
          if (row.rss_feed_url?.trim()) {
            violations.push(
              `slug "${row.slug}" (type=${row.topic_type}) has rss_feed_url — only rss_feed topics may have rss_feed_url`,
            )
          }
          if (row.rss_feed_title?.trim()) {
            violations.push(
              `slug "${row.slug}" (type=${row.topic_type}) has rss_feed_title — only rss_feed topics may have rss_feed_title`,
            )
          }
        }
      }
      expect(violations).toEqual([])
    })

    it('passes full import system validation', () => {
      const result = validateTopicRows(rows)
      const failures = result.rows.flatMap(r =>
        !r.valid ? [`row ${r.row_index} (${rows[r.row_index].slug}): ${r.errors.join(', ')}`] : [],
      )
      expect(failures).toEqual([])
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof VALID_SEED_FEED_TYPES)
})
