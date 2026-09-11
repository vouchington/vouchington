import { findMarkdownNode, findMarkdownNodes, parseGfmMarkdown } from 'vouchington-tooling/markdown'

import {
  extractBareTokenList,
  extractFirstColumnTokens,
  extractIdentifierTokens,
  extractInlineCodeTokens,
  extractInlineCodeTokensFromText,
  extractQuotedUnionTokens,
  findTableCells,
  lineMatching,
  normalizeMarkdownText,
  sectionBetween,
  sectionBetweenHeadings,
  sectionBetweenHeadingTexts,
} from './moderation-policy-doc-sync-markdown.mts'

export function extractApiReportEntityCanonicalList(content: string): string[] {
  return extractInlineCodeTokensFromText(
    sectionBetween(content, 'Canonical `entityType` values are', '## Endpoints'),
  ).filter(token => token !== 'entityType')
}

export function extractApiReportEntityRequestBodyList(content: string): string[] {
  return extractQuotedUnionTokens(lineMatching(content, '"entityType"'))
}

export function extractReportingSchemaEntityList(content: string): string[] {
  const schema = reportingSchemaBlock(content)
  const entities: string[] = []
  if (/\bpost_id\b/.test(schema)) entities.push('post', 'comment')
  if (/\breported_user_id\b/.test(schema)) entities.push('user')
  if (/\bhostname_id\b/.test(schema)) entities.push('url_hostname')
  if (/\brss_feed_item_id\b/.test(schema)) entities.push('rss_feed_item')
  return entities
}

export function extractReportingSchemaReasonList(content: string): string[] {
  return [
    ...new Set(
      [...reportingSchemaBlock(content).matchAll(/'([a-z_]+)'/g)].flatMap(match => {
        const token = match[1]
        return token === 'reviewed' || token === 'actioned' || token === 'dismissed' ? [] : [token]
      }),
    ),
  ]
}

export function extractReportEntityList(docPath: string, content: string): string[] {
  const generic = extractBareTokenList(sectionBetween(content, 'Entities:', 'Reasons:'))
  if (generic.length > 0) return generic

  if (docPath === 'docs/requirements/moderation/REPORTING.md') {
    return extractFirstColumnTokens(
      sectionBetweenHeadings(content, 'Reportable entities', 'Report reasons'),
    )
  }
  if (docPath === 'docs/requirements/moderation/MODERATION-FLOWS.md') {
    return extractInlineCodeTokensFromText(
      sectionBetween(content, '**Reportable entities:**', '**Reasons:**'),
    )
  }
  if (docPath === 'backend/api/v1/reports/README.md') {
    return [
      ...extractApiReportEntityCanonicalList(content),
      ...extractApiReportEntityRequestBodyList(content),
    ]
  }
  if (docPath === 'backend/services/moderation-reports/README.md') {
    return extractInlineCodeTokensFromText(
      sectionBetween(content, 'Canonical entity types are', '## Data Model'),
    ).filter(token => token !== 'entityType')
  }
  if (docPath === 'docs/requirements/navigation/ACTIONS.md') {
    const node = findMarkdownNode(
      parseGfmMarkdown(content),
      candidate =>
        candidate.type === 'paragraph' &&
        normalizeMarkdownText(candidate).includes('The Report action is available on'),
    )
    return node ? extractInlineCodeTokens(node) : []
  }
  return []
}

export function extractServiceReadmeTargetFkList(content: string): string[] {
  const row = findTableCells(sectionBetweenHeadings(content, 'Data Model', 'Usage'), 'Target FK')
  return row ? [...(row[2] ?? '').matchAll(/\b[a-z_]+_id\b/g)].map(match => match[0]) : []
}

export function extractReportReasonList(docPath: string, content: string): string[] {
  if (docPath === 'docs/requirements/moderation/MODERATION-FLOWS.md') {
    const reasons = extractInlineCodeTokensFromText(
      sectionBetween(content, '**Reasons:**', '**Flow:**'),
    )
    if (reasons.length > 0) return reasons
  }
  const genericText = lineMatching(content, 'Reasons:')
  const genericStart = genericText.indexOf('Reasons:')
  const generic =
    genericStart === -1
      ? []
      : extractBareTokenList(genericText.slice(genericStart + 'Reasons:'.length))
  if (generic.length > 0) return generic

  if (docPath === 'docs/requirements/moderation/REPORTING.md') {
    return extractFirstColumnTokens(
      sectionBetweenHeadingTexts(content, 'Report reasons', 'Adding a report reason'),
    )
  }
  if (docPath === 'backend/api/v1/reports/README.md') {
    return extractQuotedUnionTokens(lineMatching(content, '"reason"'))
  }
  if (docPath === 'backend/services/moderation-reports/README.md') {
    const row = findTableCells(sectionBetweenHeadings(content, 'Data Model', 'Usage'), 'reason')
    return row ? extractReasonCellTokens(row[2] ?? '').filter(token => token !== 'reason') : []
  }
  if (docPath === 'docs/requirements/navigation/ACTIONS.md') {
    return extractInlineCodeTokensFromText(
      sectionBetween(lineMatching(content, 'reason radio group'), '(', ')'),
    )
  }
  return []
}

export function extractReportJudgementReasonRankList(content: string): string[] {
  return extractInlineCodeTokensFromText(
    sectionBetween(content, 'Reason rank is', 'If the latest judgement'),
  )
}

function reportingSchemaBlock(content: string): string {
  const nodes = findMarkdownNodes(
    parseGfmMarkdown(content),
    candidate =>
      candidate.type === 'code' &&
      'value' in candidate &&
      typeof candidate.value === 'string' &&
      candidate.value.includes('CREATE TABLE moderation_reports'),
  )
  const start = content.indexOf('CREATE TABLE moderation_reports')
  const fallback =
    start === -1
      ? ''
      : content.slice(
          start,
          content.indexOf('## Review Queue', start) === -1
            ? undefined
            : content.indexOf('## Review Queue', start),
        )
  const nodeValues = nodes.flatMap(node =>
    'value' in node && typeof node.value === 'string' ? [node.value] : [],
  )
  return [...nodeValues, fallback].filter(value => value !== '').join('\n')
}

function extractReasonCellTokens(cell: string): string[] {
  const ignored = new Set([
    'and',
    'for',
    'is',
    'of',
    'one',
    'only',
    'post',
    'report',
    'reports',
    'reasons',
    'supported',
    'the',
    'valid',
    'when',
  ])
  const tokenText = cell.includes(':') ? cell.slice(cell.indexOf(':') + 1) : cell
  return extractIdentifierTokens(tokenText).filter(token => !ignored.has(token))
}
