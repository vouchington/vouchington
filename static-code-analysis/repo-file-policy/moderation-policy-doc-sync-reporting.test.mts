import { describe, expect, it } from 'vitest'

import {
  extractReportEntityList,
  extractReportingSchemaReasonList,
} from './moderation-policy-doc-sync-reporting.mts'
import { extractPolicyMatrixAllEntityList } from './moderation-policy-doc-sync-policy-matrix.mts'
import {
  extractBareTokenList,
  extractFirstColumnTokens,
  sectionBetweenHeadings,
  sectionBetweenHeadingTexts,
} from './moderation-policy-doc-sync-markdown.mts'

describe('moderation reporting Markdown extraction', () => {
  it('keeps navigation entity tokens inside the selected Report paragraph', () => {
    const markdown = [
      'Unrelated `spam` paragraph.',
      '',
      'The Report action is available on **`post`**, [`` comment ``](https://example.test), and `post`; `ReportDialog`, `not a token`, and <span>prose</span> are descriptions.',
      '',
      'Another `user` paragraph.',
      '',
      '```text',
      'fenced `other_entity`',
      '```',
    ].join('\r\n')

    expect(extractReportEntityList('docs/requirements/navigation/ACTIONS.md', markdown)).toEqual([
      'post',
      'comment',
      'post',
    ])
  })

  it('returns no navigation entities when the Report paragraph is absent', () => {
    expect(
      extractReportEntityList('docs/requirements/navigation/ACTIONS.md', 'Other `post` prose.'),
    ).toEqual([])
  })

  it('reads policy matrix entity tokens from its selected all-means-all paragraph', () => {
    const markdown = [
      '## Policy Entries',
      'Unrelated `spam` paragraph.',
      '',
      'all means all **`post`**, [`` comment ``](https://example.test), and `post`; `MODERATION_REPORT_ENTITY_TYPES` names the constant.',
      '',
      'Another `user` paragraph.',
      '## Derived Lists',
      '`other_entity` belongs to another section.',
    ].join('\r\n')

    expect(extractPolicyMatrixAllEntityList(markdown)).toEqual(['post', 'comment', 'post'])
  })

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
