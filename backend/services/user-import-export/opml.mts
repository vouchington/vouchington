import { decodeHtmlEntities } from '@ts-shared/utils/html'

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
