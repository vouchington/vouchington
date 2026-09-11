import { describe, expect, it } from 'vitest'

import {
  extractReportEntityList,
  extractReportingSchemaReasonList,
} from './moderation-policy-doc-sync-reporting.mts'
import {
  extractBareTokenList,
  extractFirstColumnTokens,
  sectionBetweenHeadings,
  sectionBetweenHeadingTexts,
} from './moderation-policy-doc-sync-markdown.mts'

describe('moderation reporting Markdown extraction', () => {
  it('normalizes first-column tokens from loose rows without a GFM table', () => {
    expect(extractFirstColumnTokens('| `alpha` | one |\n| beta | two |')).toEqual(['alpha', 'beta'])
  })

  it('keeps depth-aware and any-heading section boundaries distinct', () => {
    const markdown = ['## Start', 'before', '### End', 'nested', '## End', 'after'].join('\n')

    expect(sectionBetweenHeadings(markdown, 'Start', 'End')).toContain('nested')
    expect(sectionBetweenHeadingTexts(markdown, 'Start', 'End')).not.toContain('nested')
  })

  it('does not treat prose between generic labels as a canonical token list', () => {
    const markdown = [
      'Entities: any other user post may appear in this prose.',
      'Reasons:',
      '## Reportable entities',
      '| Entity | Description |',
      '| --- | --- |',
      '| canonical_entity | Canonical |',
      '## Report reasons',
    ].join('\n')

    expect(extractReportEntityList('docs/requirements/moderation/REPORTING.md', markdown)).toEqual([
      'canonical_entity',
    ])
  })

  it('accepts conventional connectors in a canonical bare token list', () => {
    expect(extractBareTokenList("(`rss_feed_item` and/or 'url_hostname')")).toEqual([
      'rss_feed_item',
      'url_hostname',
    ])
  })

  it('returns each fenced reporting schema reason once', () => {
    const markdown = [
      '```sql',
      'CREATE TABLE moderation_reports (',
      "  reason text CHECK (reason IN ('spam', 'other'))",
      ')',
      '```',
      '## Review Queue',
    ].join('\n')

    expect(extractReportingSchemaReasonList(markdown)).toEqual(['spam', 'other'])
  })

  it('includes distinct fenced and unfenced reporting schema reasons', () => {
    const markdown = [
      '```sql',
      'CREATE TABLE moderation_reports (',
      "  reason text CHECK (reason IN ('spam'))",
      ')',
      '```',
      'CREATE TABLE moderation_reports (',
      "  reason text CHECK (reason IN ('other'))",
      ')',
      '## Review Queue',
    ].join('\n')

    expect(extractReportingSchemaReasonList(markdown)).toEqual(['spam', 'other'])
  })
})
