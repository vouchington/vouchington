import { decodeHtmlEntities } from '@ts-shared/utils/html'

const escapedCharacterReference =
  /(^|[^\\])(?:\\\\)*\\&(?:#(?:[xX][0-9A-Fa-f]+|\d+)|[A-Za-z][A-Za-z0-9]+);/g

export function decodeVisibleMarkdownCharacterReferences(input: string): string {
  return decodeHtmlEntities(input.replace(escapedCharacterReference, maskEscapedReference))
}

function maskEscapedReference(match: string): string {
  if (match[0] === '\\') return spaces(match)
  return match[0]! + spaces(match.slice(1))
}

function spaces(input: string): string {
  return ' '.repeat(input.length)
}
