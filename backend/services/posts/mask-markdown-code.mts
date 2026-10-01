/**
 * Replaces every character of fenced, indented, and inline Markdown code with a space, keeping the
 * result the same length as `input` so indexes into either string stay interchangeable.
 */
export function maskMarkdownCode(input: string): string {
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

function spaces(match: string): string {
  return ' '.repeat(match.length)
}
