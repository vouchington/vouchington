import { findMarkdownNodes, parseGfmMarkdown } from 'vouchington-tooling/markdown'

import {
  extractFirstColumnTokens,
  extractIdentifierTokens,
  extractInlineCodeTokens,
  extractInlineCodeTokensFromText,
  extractTableRowCells,
  findTableCells,
  lineMatching,
  normalizeMarkdownText,
  sectionAfter,
  sectionBetween,
  sectionBetweenHeadings,
} from './moderation-policy-doc-sync-markdown.mts'

export type PolicyMatrixRow = {
  key: string
  label: string
  reportReason: boolean
  aiCategory: boolean
  surfaces: string
  severity: string
  appealEligible: boolean
  recommendedAction: string
  malformed?: boolean
}

type PolicyMatrixDerivedLists = {
  reportReasons: string[]
  aiCategories: string[]
}

export function extractPolicyMatrixKeys(content: string): string[] {
  return extractTableRowCells(
    sectionBetweenHeadings(content, 'Policy Entries', 'Derived Lists'),
  ).flatMap(cells => (/^[a-z_]+$/.test(cells[0] ?? '') ? [cells[0]] : []))
}

export function extractPolicyMatrixRows(content: string): PolicyMatrixRow[] {
  return extractTableRowCells(
    sectionBetweenHeadings(content, 'Policy Entries', 'Derived Lists'),
  ).flatMap(cells => {
    const key = cells[0] ?? ''
    if (cells.length === 0 || key === 'Key' || key.startsWith('—') || !/^[a-z_]+$/.test(key)) {
      return []
    }
    if (cells.length !== 8 || ![cells[2], cells[3], cells[6]].every(isBooleanCell)) {
      return [malformedPolicyMatrixRow(key)]
    }
    return [
      {
        key,
        label: cells[1],
        reportReason: cells[2] === '✓',
        aiCategory: cells[3] === '✓',
        surfaces: cells[4],
        severity: cells[5],
        appealEligible: cells[6] === '✓',
        recommendedAction: cells[7],
      },
    ]
  })
}

export function extractPolicyMatrixAllEntityList(content: string): string[] {
  const section = sectionBetweenHeadings(content, 'Policy Entries', 'Derived Lists')
  const nodes = findMarkdownNodes(
    parseGfmMarkdown(section),
    candidate =>
      candidate.type === 'paragraph' && normalizeMarkdownText(candidate).includes('all means all'),
  )
  const tokens = nodes.flatMap(node =>
    extractInlineCodeTokens(node).filter(token => token !== 'MODERATION_REPORT_ENTITY_TYPES'),
  )
  const start = section.indexOf('"all" means all')
  return tokens.length > 0
    ? tokens
    : extractInlineCodeTokensFromText(start === -1 ? '' : section.slice(start)).filter(
        token => token !== 'MODERATION_REPORT_ENTITY_TYPES',
      )
}

export function extractPolicyMatrixDerivedLists(content: string): PolicyMatrixDerivedLists {
  const section = sectionBetweenHeadings(content, 'Derived Lists', 'Action Enums')
  return {
    reportReasons: extractInlineCodeTokensFromText(
      sectionBetween(section, 'Report reasons (List A)', 'AI content-policy categories (List B)'),
    ).filter(token => token !== 'MODERATION_REPORT_REASONS'),
    aiCategories: extractInlineCodeTokensFromText(
      sectionAfter(section, 'AI content-policy categories (List B)'),
    ).filter(token => token !== 'CONTENT_POLICY_CATEGORIES'),
  }
}

export function extractPolicyMatrixJudgementActionList(content: string): string[] {
  return extractActionList(content, 'MODERATION_JUDGEMENT_ACTIONS')
}

export function extractPolicyMatrixAppealActionList(content: string): string[] {
  return extractActionList(content, 'MODERATION_APPEAL_ACTIONS')
}

export function extractPolicyMatrixSeverityList(content: string): string[] {
  return extractFirstColumnTokens(sectionBetweenHeadings(content, 'Severity Levels', 'Runbooks'))
}

function extractActionList(content: string, name: string): string[] {
  const section = sectionBetweenHeadings(content, 'Action Enums', 'Severity Levels')
  const row = findTableCells(section, name)
  const tokens = row ? extractIdentifierTokens(row[1] ?? '').filter(token => token !== name) : []
  return tokens.length > 0
    ? tokens
    : extractInlineCodeTokensFromText(lineMatching(section, name)).filter(token => token !== name)
}

function malformedPolicyMatrixRow(key: string): PolicyMatrixRow {
  return {
    key,
    label: '',
    reportReason: false,
    aiCategory: false,
    surfaces: '',
    severity: '',
    appealEligible: false,
    recommendedAction: '',
    malformed: true,
  }
}

function isBooleanCell(cell: string): boolean {
  return cell === '✓' || cell === '—'
}
