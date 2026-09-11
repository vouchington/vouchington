import { isMeaningfulEvidence } from './evidence-values.mts'
import type { MarkdownNode } from './markdown.mts'

export type AlternativeDecisionOutcome = 'chosen' | 'accepted' | 'rejected'

interface AlternativeDecisionSegment {
  deleted: boolean
  inlineCode: boolean
  text: string
}

const ALTERNATIVE_RATIONALE_MARKER = String.raw`(?:[Tt][Bb][Dd]|[Tt][Oo][Dd][Oo])`
const STANDALONE_ALTERNATIVE_RATIONALE_MARKER = String.raw`${ALTERNATIVE_RATIONALE_MARKER}(?![\w-])`
const NON_HYPHEN_ALTERNATIVE_RATIONALE_DELIMITER = String.raw`[:;—]`
const ALTERNATIVE_RATIONALE_OPENING_WRAPPER = String.raw`[\(\[\{"'“‘]`
const ALTERNATIVE_RATIONALE_GROUP_OPENING_WRAPPER = String.raw`[\(\[\{]`
const ALTERNATIVE_RATIONALE_CLOSING_WRAPPER = String.raw`[\)\]\}"'”’]`
const OPTIONAL_ALTERNATIVE_RATIONALE_OPENING_WRAPPER = String.raw`(?:${ALTERNATIVE_RATIONALE_GROUP_OPENING_WRAPPER})?`
const OPTIONAL_ALTERNATIVE_RATIONALE_CLOSING_WRAPPER = String.raw`(?:${ALTERNATIVE_RATIONALE_CLOSING_WRAPPER})?`
const ALTERNATIVE_RATIONALE_CONTINUATION_SEPARATOR_AFTER_WRAPPER = String.raw`\s*(?:,\s*)?(?:and\s+)?${OPTIONAL_ALTERNATIVE_RATIONALE_OPENING_WRAPPER}\s*`
const UNRESOLVED_ALTERNATIVE_RATIONALE_CONTINUATION = String.raw`(?:[lL]ater|[pP]ending|[aA]waiting|[uU]ntil)`
const UNRESOLVED_ALTERNATIVE_RATIONALE_MARKER_SUFFIX = String.raw`\s*${OPTIONAL_ALTERNATIVE_RATIONALE_CLOSING_WRAPPER}(?:${ALTERNATIVE_RATIONALE_CONTINUATION_SEPARATOR_AFTER_WRAPPER}${UNRESOLVED_ALTERNATIVE_RATIONALE_CONTINUATION}\b|\s*${NON_HYPHEN_ALTERNATIVE_RATIONALE_DELIMITER}|\s+-)`
const UNRESOLVED_ALTERNATIVE_RATIONALE_RE = new RegExp(
  String.raw`(?:\b${STANDALONE_ALTERNATIVE_RATIONALE_MARKER}${UNRESOLVED_ALTERNATIVE_RATIONALE_MARKER_SUFFIX}|(?:^|[\s:;—\-]|${ALTERNATIVE_RATIONALE_OPENING_WRAPPER})${STANDALONE_ALTERNATIVE_RATIONALE_MARKER}\s*(?:${ALTERNATIVE_RATIONALE_CLOSING_WRAPPER})?[.!?]?$)`,
)
const ALTERNATIVE_RATIONALE_MARKER_RE = new RegExp(
  String.raw`\b${STANDALONE_ALTERNATIVE_RATIONALE_MARKER}`,
  'g',
)
const OUTSIDE_UNRESOLVED_MARKER_SUFFIX_RE = new RegExp(
  String.raw`^${UNRESOLVED_ALTERNATIVE_RATIONALE_MARKER_SUFFIX}`,
)
const BARE_UNRESOLVED_REVIEW_TIMING_RE =
  /^(?:[pP]ending|[aA]waiting)\s+(?:(?:[sS]takeholder|[oO]wner)\s+)?(?:[rR]eview|[aA]pproval)[.!?]?$/
const SUBSTANTIVE_DECISION_RATIONALE_RE = /[\p{L}\p{N}]/u

function alternativeDecisionSegments(
  node: MarkdownNode,
  inheritedDelete = false,
): AlternativeDecisionSegment[] {
  if (node.type === 'html' || node.type === 'code') return []
  const deleted = inheritedDelete || node.type === 'delete'
  if (node.type === 'inlineCode') return [{ deleted, inlineCode: true, text: node.value ?? '' }]
  const own = [node.value, node.alt]
    .filter((value): value is string => typeof value === 'string')
    .map(text => ({ deleted, inlineCode: false, text }))
  return [
    ...own,
    ...(node.children ?? []).flatMap(child => alternativeDecisionSegments(child, deleted)),
  ]
}

function renderSegments(
  segments: AlternativeDecisionSegment[],
  include: (segment: AlternativeDecisionSegment, index: number) => boolean,
  start = 0,
): string {
  let offset = 0
  const values: string[] = []
  for (const [index, segment] of segments.entries()) {
    const sliceStart = Math.max(0, start - offset)
    if (sliceStart < segment.text.length) {
      const value = segment.text.slice(sliceStart)
      values.push(include(segment, index) ? value : ' '.repeat(value.length))
    }
    offset += segment.text.length
  }
  return values.join('')
}

function hasUnsafeOutcomeProvenance(
  segments: AlternativeDecisionSegment[],
  start: number,
  end: number,
): boolean {
  let offset = 0
  for (const segment of segments) {
    const overlaps =
      (segment.inlineCode || segment.deleted) &&
      offset < end &&
      offset + segment.text.length > start
    offset += segment.text.length
    if (overlaps) return true
  }
  return false
}

function markerRangeProvenance(
  segments: AlternativeDecisionSegment[],
  start: number,
  end: number,
): { deleted: boolean; segmentEnd: number; whollyInline: boolean } {
  let offset = 0
  const overlapping: Array<{ end: number; segment: AlternativeDecisionSegment }> = []
  for (const segment of segments) {
    const segmentEnd = offset + segment.text.length
    if (offset < end && segmentEnd > start) overlapping.push({ end: segmentEnd, segment })
    offset = segmentEnd
  }
  return {
    deleted: overlapping.some(({ segment }) => segment.deleted),
    segmentEnd: Math.max(...overlapping.map(item => item.end)),
    whollyInline: overlapping.every(({ segment }) => segment.inlineCode),
  }
}

function markerGrammarText(segments: AlternativeDecisionSegment[]): string {
  const text = renderSegments(segments, () => true)
  const grammar = renderSegments(
    segments,
    segment => !segment.inlineCode && !segment.deleted,
  ).split('')
  for (const match of text.matchAll(ALTERNATIVE_RATIONALE_MARKER_RE)) {
    const start = match.index
    const end = start + match[0].length
    const provenance = markerRangeProvenance(segments, start, end)
    if (provenance.deleted) continue
    const outsideText = renderSegments(
      segments,
      segment => !segment.inlineCode && !segment.deleted,
      provenance.segmentEnd,
    )
    if (provenance.whollyInline && !OUTSIDE_UNRESOLVED_MARKER_SUFFIX_RE.test(outsideText)) continue
    for (let index = start; index < end; index++) grammar[index] = text[index]
  }
  return grammar.join('')
}

export function parseAlternativeDecision(node: MarkdownNode): AlternativeDecisionOutcome | null {
  const segments = alternativeDecisionSegments(node)
  const text = renderSegments(segments, () => true)
  const match =
    /^(chosen|accepted|rejected)(?:(?:,\s*|\s+)(?:because|with|as|by)\b\s+|[:;—-]\s*)(\S.*)$/i.exec(
      text,
    )
  if (match === null || hasUnsafeOutcomeProvenance(segments, 0, match[1].length)) return null
  const rationaleStart = text.length - match[2].length
  const rationaleProse = renderSegments(
    segments,
    segment => !segment.inlineCode && !segment.deleted,
    rationaleStart,
  )
  if (
    !isMeaningfulEvidence(rationaleProse) ||
    !SUBSTANTIVE_DECISION_RATIONALE_RE.test(rationaleProse) ||
    BARE_UNRESOLVED_REVIEW_TIMING_RE.test(rationaleProse.trim()) ||
    UNRESOLVED_ALTERNATIVE_RATIONALE_RE.test(markerGrammarText(segments))
  )
    return null
  return match[1].toLowerCase() as AlternativeDecisionOutcome
}
