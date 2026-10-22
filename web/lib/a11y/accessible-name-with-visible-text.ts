const NON_WORD = /[^\p{L}\p{N}]+/gu

function words(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(NON_WORD, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function containsContiguousWords(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return true
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true
  }
  return false
}

/** Keep `accessibleName` when its words already contain `visibleText` in order. */
export function accessibleNameWithVisibleText(visibleText: string, accessibleName: string): string {
  if (containsContiguousWords(words(accessibleName), words(visibleText))) return accessibleName
  return `${visibleText}. ${accessibleName}`
}
