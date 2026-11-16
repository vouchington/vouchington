import { decodeHtmlEntities } from '@ts-shared/utils/html'

export type OpmlOutline = {
  text: string
  xmlUrl: string
  htmlUrl: string | null
}

const OUTLINE_PATTERN = /<outline\s[^>]*?xmlUrl\s*=\s*"([^"]*)"[^>]*?\/?>/gi
const ATTR_PATTERN = /(\w+)\s*=\s*"([^"]*)"/g

function parseOutlineAttributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(ATTR_PATTERN)].map(match => [
      match[1]!.toLowerCase(),
      decodeHtmlEntities(match[2]!),
    ]),
  )
}

export function* parseOpmlOutlines(opmlText: string): Generator<OpmlOutline> {
  for (const match of opmlText.matchAll(OUTLINE_PATTERN)) {
    const attrs = parseOutlineAttributes(match[0])
    const xmlUrl = attrs['xmlurl']
    if (!xmlUrl) continue

    yield {
      text: attrs['text'] || attrs['title'] || '',
      xmlUrl,
      htmlUrl: attrs['htmlurl'] || null,
    }
  }
}
