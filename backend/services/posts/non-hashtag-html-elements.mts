const nonHashtagHtmlElements = new Set(['script', 'style', 'pre', 'code'])

export function maskNonHashtagHtmlElementContents(input: string, htmlTokens: RegExp): string {
  const masked = input.split('')
  const openElements: Array<{ name: string; contentStart: number }> = []

  for (const match of input.matchAll(htmlTokens)) {
    const token = match[0]!
    const tagName = /^<\/?([A-Za-z][A-Za-z0-9-]*)\b/i.exec(token)?.[1]?.toLowerCase()
    if (!tagName || !nonHashtagHtmlElements.has(tagName)) continue

    const start = match.index!
    if (token.startsWith('</')) {
      const openIndex = openElements.findLastIndex(element => element.name === tagName)
      if (openIndex === -1) continue
      for (const openElement of openElements.splice(openIndex)) {
        masked.fill(' ', openElement.contentStart, start)
      }
    } else if (!/\/\s*>$/.test(token)) {
      openElements.push({ name: tagName, contentStart: start + token.length })
    }
  }

  for (const openElement of openElements) {
    masked.fill(' ', openElement.contentStart, input.length)
  }
  return masked.join('')
}
