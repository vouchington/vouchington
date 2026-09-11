import { decodeHtmlEntities, escapeHtml } from '@ts-shared/utils/html'

export type OpmlOutline = {
  text: string
  xmlUrl: string
  htmlUrl: string | null
}

const OUTLINE_PATTERN = /<outline\s[^>]*?xmlUrl\s*=\s*"([^"]*)"[^>]*?\/?>/gi
const ATTR_PATTERN = /(\w+)\s*=\s*"([^"]*)"/g

function parseOutlineAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  let match: RegExpExecArray | null
  ATTR_PATTERN.lastIndex = 0
  while ((match = ATTR_PATTERN.exec(tag)) !== null) {
    attrs[match[1]!.toLowerCase()] = decodeHtmlEntities(match[2]!)
  }
  return attrs
}

export function parseOpml(opmlText: string): OpmlOutline[] {
  const outlines: OpmlOutline[] = []
  let match: RegExpExecArray | null
  OUTLINE_PATTERN.lastIndex = 0

  while ((match = OUTLINE_PATTERN.exec(opmlText)) !== null) {
    const attrs = parseOutlineAttributes(match[0]!)
    const xmlUrl = attrs['xmlurl']
    if (!xmlUrl) continue

    outlines.push({
      text: attrs['text'] || attrs['title'] || '',
      xmlUrl,
      htmlUrl: attrs['htmlurl'] || null,
    })
  }

  return outlines
}

export function* parseOpmlOutlines(opmlText: string): Generator<OpmlOutline> {
  let match: RegExpExecArray | null
  OUTLINE_PATTERN.lastIndex = 0

  while ((match = OUTLINE_PATTERN.exec(opmlText)) !== null) {
    const attrs = parseOutlineAttributes(match[0]!)
    const xmlUrl = attrs['xmlurl']
    if (!xmlUrl) continue

    yield {
      text: attrs['text'] || attrs['title'] || '',
      xmlUrl,
      htmlUrl: attrs['htmlurl'] || null,
    }
  }
}

export function generateOpml(feeds: OpmlOutline[], title = 'RSS Feed Export'): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeHtml(title)}</title>`,
    '  </head>',
    '  <body>',
  ]

  for (const feed of feeds) {
    const attrs = [`text="${escapeHtml(feed.text)}"`, `xmlUrl="${escapeHtml(feed.xmlUrl)}"`]
    if (feed.htmlUrl) {
      attrs.push(`htmlUrl="${escapeHtml(feed.htmlUrl)}"`)
    }
    attrs.push('type="rss"')
    lines.push(`    <outline ${attrs.join(' ')} />`)
  }

  lines.push('  </body>', '</opml>', '')

  return lines.join('\n')
}
