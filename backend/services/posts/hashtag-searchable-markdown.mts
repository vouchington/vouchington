import { decodeVisibleMarkdownCharacterReferences } from './markdown-character-references.mts'
import { maskNonHashtagHtmlElementContents } from './non-hashtag-html-elements.mts'
import { maskMarkdownCode } from './mask-markdown-code.mts'
import { maskHashtagBearingUrls } from '@modules/utils'

const markdownHtmlOrAutolink =
  /<!--(?:[^-]|-(?!->))*-->|<![A-Z][^>]*>|<\?[\s\S]*?\?>|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+(?:[A-Za-z_:][A-Za-z0-9:_.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?))*\s*\/?>|<(?:[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*|[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)>/g
const escapedHashtag = /(^|[^\\])(?:\\\\)*\\#/g
export function getHashtagSearchableMarkdown(input: string): string {
  const visibleMarkdown = maskMarkdownImagesAndDestinations(
    maskMarkdownCode(maskNonHashtagHtmlElementContents(input, markdownHtmlOrAutolink)),
  )
    .replace(markdownHtmlOrAutolink, spaces)
    .replace(escapedHashtag, maskEscapedHashtag)
  return maskHashtagBearingUrls(decodeVisibleMarkdownCharacterReferences(visibleMarkdown))
}

function spaces(match: string): string {
  return ' '.repeat(match.length)
}

function maskEscapedHashtag(match: string): string {
  if (match[0] === '\\') return spaces(match)
  return match[0]! + spaces(match.slice(1))
}

function maskMarkdownImagesAndDestinations(input: string): string {
  const masked = input.split('')
  for (const [start, end] of linkReferenceDefinitionRanges(input)) masked.fill(' ', start, end)
  const pairs = buildDelimiterPairs(input)
  const definitions = new Set(
    [...input.matchAll(/^(?:(?: {0,3}>[ \t]?)+)? {0,3}\[([^\]]+)\]:/gm)].map(match =>
      normalizeReference(match[1]!),
    ),
  )
  for (let start = 0; start < input.length; start++) {
    if (input[start] !== '[' || pairs.escaped[start]) continue
    const isImage = input[start - 1] === '!' && !pairs.escaped[start - 1]
    const labelEnd = pairs.square.get(start)
    if (labelEnd === undefined) continue
    const destinationEnd = pairs.round.get(labelEnd + 1)
    if (destinationEnd !== undefined) {
      masked.fill(' ', isImage ? start - 1 : labelEnd + 1, destinationEnd + 1)
      if (isImage) start = destinationEnd
      continue
    }
    if (!isImage) continue
    const referenceEnd = pairs.square.get(labelEnd + 1)
    const alt = input.slice(start + 1, labelEnd)
    const reference = referenceEnd ? input.slice(labelEnd + 2, referenceEnd) || alt : alt
    if (definitions.has(normalizeReference(reference))) {
      const end = referenceEnd ?? labelEnd
      masked.fill(' ', start - 1, end + 1)
      start = end
    }
  }
  return masked.join('')
}

function linkReferenceDefinitionRanges(input: string): Array<readonly [number, number]> {
  const definition =
    /^(?:(?: {0,3}>[ \t]?)+)? {0,3}\[(?:\\.|[^\]\\])+\]:[ \t]*(?:<[^<>\n]*>|(?:\\[^\n]|[^\\\s<>])+)(?:(?:[ \t]+|\n(?:(?: {0,3}>[ \t]?)+)?[ \t]*)(?:"[^"\n]*"|'[^'\n]*'|\([^\n]*\)))?[ \t]*$/gm
  return [...input.matchAll(definition)].map(
    match => [match.index!, match.index! + match[0].length] as const,
  )
}

function buildDelimiterPairs(input: string) {
  const square = new Map<number, number>()
  const round = new Map<number, number>()
  let squareStack: DelimiterStack = null
  let roundStack: DelimiterStack = null
  const escaped: boolean[] = []
  let backslashes = 0
  for (let index = 0; index < input.length; index++) {
    const character = input[index]!
    if (character === '\\') {
      backslashes++
      continue
    }
    escaped[index] = backslashes % 2 === 1
    backslashes = 0
    if (escaped[index]) continue
    if (character === '[') squareStack = { index, rest: squareStack }
    else if (character === ']') squareStack = pairLast(squareStack, square, index)
    else if (character === '(') roundStack = { index, rest: roundStack }
    else if (character === ')') roundStack = pairLast(roundStack, round, index)
  }
  return { square, round, escaped }
}

/** Persistent stack, so each push and pop is O(1) without mutating a shared array. */
type DelimiterStack = { readonly index: number; readonly rest: DelimiterStack } | null

function pairLast(stack: DelimiterStack, pairs: Map<number, number>, end: number): DelimiterStack {
  if (stack) pairs.set(stack.index, end)
  return stack?.rest ?? null
}

function normalizeReference(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}
