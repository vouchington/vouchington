import { decodeVisibleMarkdownCharacterReferences } from './markdown-character-references.mts'
import { maskNonHashtagHtmlElementContents } from './non-hashtag-html-elements.mts'
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

function maskMarkdownCode(input: string): string {
  const masked = input.split('')
  const openingFence =
    /^(?:(?: {0,3}>[ \t]*| {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+))* {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/gm
  for (const opening of input.matchAll(openingFence)) {
    const markerIndex = opening.index! + opening[0].indexOf(opening[1]!)
    if (masked[markerIndex] === ' ') continue
    const marker = opening[1]![0]!
    const infoString = opening[0].slice(markerIndex - opening.index! + opening[1]!.length)
    if (marker === '`' && infoString.includes('`')) continue
    const openingPrefix = opening[0].slice(0, opening[0].indexOf(opening[1]!))
    const quoteDepth = (openingPrefix.match(/>/g) ?? []).length
    const closingPrefix = getFenceClosingPrefix(openingPrefix)
    const closingFence = new RegExp(
      `^${closingPrefix} {0,3}${marker === '`' ? '`' : '~'}{${opening[1]!.length},}[ \\t]*(?:\\n|$)`,
      'gm',
    )
    closingFence.lastIndex = opening.index! + opening[0].length
    const closing = closingFence.exec(input)
    const end = closing
      ? closing.index + closing[0].length
      : findUnclosedFenceEnd(input, opening.index! + opening[0].length, quoteDepth, openingPrefix)
    masked.fill(' ', opening.index!, end)
  }
  for (const line of input.matchAll(/^(?: {0,3}>[ \t]?)+ {4}[^\n]*/gm)) {
    masked.fill(' ', line.index!, line.index! + line[0].length)
  }
  maskIndentedCodeBlocks(input, masked)
  for (const span of masked.join('').matchAll(/(?<!`)(`+)(?!`)([\s\S]*?)(?<!`)\1(?!`)/g)) {
    masked.fill(' ', span.index!, span.index! + span[0].length)
  }
  return masked.join('')
}

function getFenceClosingPrefix(openingPrefix: string): string {
  const container = / {0,3}>[ \t]*| {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/g
  let closingPrefix = ''
  let end = 0
  for (const token of openingPrefix.matchAll(container)) {
    closingPrefix += escapeRegExp(openingPrefix.slice(end, token.index!))
    closingPrefix += token[0]!.includes('>') ? ' {0,3}>[ \\t]*' : spaces(token[0]!)
    end = token.index! + token[0]!.length
  }
  return closingPrefix + escapeRegExp(openingPrefix.slice(end))
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findUnclosedFenceEnd(
  input: string,
  start: number,
  quoteDepth: number,
  openingPrefix: string,
): number {
  const hasListContainer = / {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+/.test(openingPrefix)
  if (quoteDepth === 0 && !hasListContainer) return input.length
  const containerPrefix = getFenceClosingPrefix(openingPrefix)
  const containerEnd = new RegExp(`^(?!${containerPrefix}|[ \\t]*(?:\\r?\\n|$))`, 'gm')
  containerEnd.lastIndex = start
  return containerEnd.exec(input)?.index ?? input.length
}

function maskIndentedCodeBlocks(input: string, masked: string[]): void {
  const lines = [...input.matchAll(/[^\n]*(?:\n|$)/g)].filter(line => line[0] !== '')
  let inCodeBlock = false
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!
    const content = line[0].replace(/\n$/, '')
    if (inCodeBlock && !content.trim()) continue
    if (!/^(?: {4}| {0,3}\t)/.test(content)) {
      inCodeBlock = false
      continue
    }
    if (!inCodeBlock && !canStartIndentedCodeBlock(lines, lineIndex)) continue
    inCodeBlock = true
    masked.fill(' ', line.index!, line.index! + content.length)
  }
}

function canStartIndentedCodeBlock(lines: RegExpMatchArray[], lineIndex: number): boolean {
  if (lineIndex === 0) return true
  const previous = lines[lineIndex - 1]![0].replace(/\n$/, '')
  if (!previous.trim()) return canBeIndentedCodeAfterList(lines, lineIndex)
  return /^(?: {0,3}#{1,6}(?:[ \t]|$)| {0,3}(?:`{3,}|~{3,})| {0,3}(?:[-*_][ \t]*){3,})/.test(
    previous,
  )
}

function canBeIndentedCodeAfterList(lines: RegExpMatchArray[], lineIndex: number): boolean {
  const indentation = /^ */.exec(lines[lineIndex]![0])![0].length
  for (let index = lineIndex - 1; index >= 0; index--) {
    const previous = lines[index]![0].replace(/\n$/, '')
    if (!previous.trim()) continue
    const marker = /^( {0,3})(?:[-+*]|\d{1,9}[.)])( +)/.exec(previous)
    if (marker) return indentation >= marker[0].length + 4
    if (!/^ /.test(previous)) return true
  }
  return true
}

function maskMarkdownImagesAndDestinations(input: string): string {
  const masked = input.split('')
  maskLinkReferenceDefinitions(input, masked)
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

function maskLinkReferenceDefinitions(input: string, masked: string[]): void {
  const definition =
    /^(?:(?: {0,3}>[ \t]?)+)? {0,3}\[(?:\\.|[^\]\\])+\]:[ \t]*(?:<[^<>\n]*>|(?:\\[^\n]|[^\\\s<>])+)(?:(?:[ \t]+|\n(?:(?: {0,3}>[ \t]?)+)?[ \t]*)(?:"[^"\n]*"|'[^'\n]*'|\([^\n]*\)))?[ \t]*$/gm
  for (const match of input.matchAll(definition)) {
    masked.fill(' ', match.index!, match.index! + match[0].length)
  }
}

function buildDelimiterPairs(input: string) {
  const square = new Map<number, number>()
  const round = new Map<number, number>()
  const squareStack: number[] = []
  const roundStack: number[] = []
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
    if (character === '[') squareStack.push(index)
    else if (character === ']') pairLast(squareStack, square, index)
    else if (character === '(') roundStack.push(index)
    else if (character === ')') pairLast(roundStack, round, index)
  }
  return { square, round, escaped }
}

function pairLast(stack: number[], pairs: Map<number, number>, end: number): void {
  const start = stack.pop()
  if (start !== undefined) pairs.set(start, end)
}

function normalizeReference(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}
