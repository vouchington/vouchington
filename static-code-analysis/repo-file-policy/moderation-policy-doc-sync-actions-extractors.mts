import {
  extractLooseMarkdownTableRows,
  extractMarkdownTables,
  findMarkdownNode,
  parseGfmMarkdown,
  type MarkdownNode,
} from 'vouchington-tooling/markdown'

import type {
  CanonicalMarkdownComposition,
  MarkdownSourceLocation,
} from './canonical-markdown-children.mts'
import {
  extractInlineCodeTokens,
  extractInlineCodeTokensFromText,
  lineMatching,
  normalizeMarkdownText,
  normalizePolicyMatrixCell,
  sectionBetween,
} from './moderation-policy-doc-sync-markdown.mts'

export const POST_ONLY_VOTE_MANIPULATION_PATTERN =
  /(?:vote_manipulation[\s\S]{0,240}(?:post-only|only valid[\s\S]{0,160}\bpost\b|valid only[\s\S]{0,160}\bpost\b)|(?:post-only|only valid[\s\S]{0,160}\bpost\b|valid only[\s\S]{0,160}\bpost\b)[\s\S]{0,240}vote_manipulation)/i

export type LocatedDocToken = { source: MarkdownSourceLocation; token: string }

type ActionsModerationAssertions = {
  reportEntities: LocatedDocToken[]
  reportSectionSource: MarkdownSourceLocation
  reportTableEntities: LocatedDocToken[]
  reportTableSource: MarkdownSourceLocation
  reportReasons: LocatedDocToken[]
  reportReasonsSource: MarkdownSourceLocation
  voteManipulationWordingSource: MarkdownSourceLocation
}

export function extractActionsModerationAssertions(
  composition: CanonicalMarkdownComposition,
  fallbackSource: MarkdownSourceLocation,
): ActionsModerationAssertions {
  const { content } = composition
  const root = parseGfmMarkdown(content)
  const reportHeading = findMarkdownNode(
    root,
    node => node.type === 'heading' && normalizeMarkdownText(node) === 'Report',
  )
  const reportParagraph = findMarkdownNode(
    root,
    node =>
      node.type === 'paragraph' &&
      normalizeMarkdownText(node).includes('The Report action is available on'),
  )
  const reasonParagraph = findMarkdownNode(
    root,
    node => node.type === 'paragraph' && normalizeMarkdownText(node).includes('reason radio group'),
  )
  const reportSectionSource = sourceAtNode(
    composition,
    reportParagraph ?? reportHeading,
    fallbackSource,
  )
  const reportTableEntities = extractLocatedTableEntities(root, composition, reportSectionSource)
  const reportReasons = locatedReportReasonTokens(
    content,
    reasonParagraph,
    composition,
    reportSectionSource,
  )
  const reportReasonsSource = reportReasons[0]?.source ?? reportSectionSource
  const voteMatch = POST_ONLY_VOTE_MANIPULATION_PATTERN.exec(content)
  let voteManipulationWordingSource = reportReasonsSource
  if (voteMatch?.index !== undefined) {
    try {
      voteManipulationWordingSource = composition.sourceAtOffset(voteMatch.index)
    } catch {
      // A malformed composition retains the report section fallback for a useful diagnostic.
    }
  }
  return {
    reportEntities: reportParagraph
      ? locatedInlineCodeTokens(reportParagraph, composition, reportSectionSource)
      : [],
    reportSectionSource,
    reportTableEntities,
    reportTableSource: reportTableEntities[0]?.source ?? reportSectionSource,
    reportReasons,
    reportReasonsSource,
    voteManipulationWordingSource,
  }
}

function sourceAtLine(
  composition: CanonicalMarkdownComposition,
  line: number,
  fallbackSource: MarkdownSourceLocation,
): MarkdownSourceLocation {
  try {
    return composition.sourceAtLine(line)
  } catch {
    return fallbackSource
  }
}

function sourceAtNode(
  composition: CanonicalMarkdownComposition,
  node: MarkdownNode | null | undefined,
  fallbackSource: MarkdownSourceLocation,
): MarkdownSourceLocation {
  return sourceAtLine(composition, node?.position?.start.line ?? 1, fallbackSource)
}

function locatedInlineCodeTokens(
  node: MarkdownNode,
  composition: CanonicalMarkdownComposition,
  fallbackSource: MarkdownSourceLocation,
): LocatedDocToken[] {
  const source = sourceAtNode(composition, node, fallbackSource)
  return extractInlineCodeTokens(node).map(token => ({ source, token }))
}

function locatedReportReasonTokens(
  content: string,
  node: MarkdownNode | null | undefined,
  composition: CanonicalMarkdownComposition,
  fallbackSource: MarkdownSourceLocation,
): LocatedDocToken[] {
  const pattern = 'reason radio group'
  const offset = content.indexOf(pattern)
  const source = node
    ? sourceAtNode(composition, node, fallbackSource)
    : sourceAtLine(
        composition,
        offset === -1 ? 1 : content.slice(0, offset).split('\n').length,
        fallbackSource,
      )
  const startOffset = node?.position?.start.offset
  const endOffset = node?.position?.end?.offset
  const hasNodeOffsets = startOffset !== undefined && endOffset !== undefined
  const nodeContent = hasNodeOffsets
    ? content.slice(startOffset, endOffset)
    : lineMatching(content, pattern)
  const tokens =
    node && !hasNodeOffsets
      ? extractInlineCodeTokens(node)
      : extractInlineCodeTokensFromText(
          sectionBetween(lineMatching(nodeContent, pattern), '(', ')'),
        )
  return tokens.map(token => ({ source, token }))
}

function extractLocatedTableEntities(
  root: ReturnType<typeof parseGfmMarkdown>,
  composition: CanonicalMarkdownComposition,
  fallbackSource: MarkdownSourceLocation,
): LocatedDocToken[] {
  const tables = extractMarkdownTables(root)
  const tableRanges = tables.flatMap(table => (table.position ? [table.position] : []))
  const rows = tables.flatMap(table =>
    table.rows.flatMap(row =>
      locatedTableEntity(row.cells[0], row.line, composition, fallbackSource),
    ),
  )
  for (const row of extractLooseMarkdownTableRows(composition.content, {
    excludePositions: tableRanges,
  })) {
    rows.push(...locatedTableEntity(row.cells[0], row.line, composition, fallbackSource))
  }
  return rows
}

function locatedTableEntity(
  firstCell: string | undefined,
  line: number,
  composition: CanonicalMarkdownComposition,
  fallbackSource: MarkdownSourceLocation,
): LocatedDocToken[] {
  const match = /^Report \(([a-z_]+)\)$/.exec(normalizePolicyMatrixCell(firstCell ?? ''))
  return match ? [{ source: sourceAtLine(composition, line, fallbackSource), token: match[1] }] : []
}
