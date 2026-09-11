import { generateRssFeed } from 'feedsmith'
import onError from '@modules/on-error'

export interface RssChannel {
  title: string
  link: string
  description: string
  language?: string
  lastBuildDate?: Date
}

export interface RssItem {
  title: string
  link: string
  description: string
  pubDate?: Date
  guid: string
  categories?: string[]
  author?: string
}

export function buildRssXml(channel: RssChannel, items: RssItem[]): string {
  try {
    return buildRssXmlImpl(channel, items)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}

// feedsmith's XML builder runs with `format: true` and, unlike `feed`, only CDATA-wraps a value
// when it contains `<`, `>`, `&`, or `]]>`. When it does wrap, the formatter places the
// `<![CDATA[...]]>` on its own indented line rather than inline with the tag. That's cosmetic
// for human-facing text, but this builder also CDATA-wraps `<guid>` and `<link>` the same way —
// and news-feed guids/links are external article URLs, which routinely carry `&` in query
// strings (utm params, etc.). A guid or link value read back with surrounding
// whitespace/newlines is a different string than the original URL, which would desync every
// affected item's identity for subscribers. Collapse the whitespace back to inline so every
// CDATA-wrapped value round-trips to exactly its original string, matching the prior `feed`
// output's inline format. Safe unconditionally: a literal `]]>` cannot occur inside a
// `<![CDATA[...]]>` section (it terminates the section), so the non-greedy match can't overrun
// into a sibling element.
const CDATA_WHITESPACE_REGEX =
  /(<[a-zA-Z0-9:-]+(?:\s+[^>]*)?>)\s*((?:<!\[CDATA\[[\s\S]*?\]\]>\s*)+)(<\/[a-zA-Z0-9:-]+>)/g

function buildRssXmlImpl(channel: RssChannel, items: RssItem[]): string {
  const xml = generateRssFeed({
    title: channel.title,
    link: channel.link,
    description: channel.description,
    language: channel.language ?? 'en',
    lastBuildDate: channel.lastBuildDate ? new Date(channel.lastBuildDate) : undefined,
    items: items.map(item => ({
      title: item.title,
      link: item.link,
      description: item.description,
      guid: { value: item.guid, isPermaLink: false },
      pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
      categories: item.categories?.map(name => ({ name })),
    })),
  })
  return xml.replace(CDATA_WHITESPACE_REGEX, (_match, openTag, cdataContent, closeTag) => {
    const cleanedContent = cdataContent.replace(/(^|]]>)\s*(<!\[CDATA\[|$)/g, '$1$2')
    return `${openTag}${cleanedContent}${closeTag}`
  })
}
