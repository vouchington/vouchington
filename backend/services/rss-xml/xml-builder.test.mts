import { describe, expect, it } from 'vitest'
import { buildRssXml, type RssChannel, type RssItem } from './xml-builder.mts'

// Pins the full buildRssXml() output byte-for-byte. This is deliberately not a `toContain`
// fragment test: the feed -> feedsmith migration (see docs/checklists/parser-library-swap.md)
// changes element ordering, CDATA formatting, and dropped metadata tags, and nothing else in
// this package's test suite would catch a structural regression in the generated document.
//
// feedsmith's output differs from the prior `feed`-package output in several deliberate,
// content-preserving ways (verified via a side-by-side differential run of both libraries):
// - 2-space indentation instead of 4-space.
// - CDATA wrapping is conditional (only when the value contains `<`, `>`, `&`, or `]]>`)
//   instead of unconditional, so plain values like the second item's title/description/
//   category render as plain text, and a link containing `&` in its query string gets
//   CDATA-wrapped (feedsmith applies the same escaping rule to every string field, including
//   `<guid>` and `<link>`).
// - When format:true wraps a value in CDATA, fast-xml-parser puts it on its own indented line
//   (`<title>\n  <![CDATA[...]]>\n</title>`) rather than inline. For most fields that's cosmetic,
//   but `<guid>` and `<link>` can legitimately hold external URLs with `&` in the query string
//   (news-feed items), and reading back a value with injected whitespace/newlines would not
//   match the original URL — a real identity change for subscribers, not merely a formatting
//   difference. `buildRssXmlImpl` post-processes the generated XML with a regex
//   (`CDATA_WHITESPACE_REGEX`) to collapse CDATA sections back to inline, so every wrapped value
//   round-trips to exactly its original string, matching `feed`'s inline format.
// - The channel `<link>` is no longer run through URL normalization, so a bare-origin URL
//   keeps its original form instead of gaining a trailing slash.
// - `<docs>` and `<generator>` are no longer emitted, since feedsmith only writes them when
//   explicitly set and this builder does not set them.
// - The redundant `<content:encoded>` element (and its `xmlns:dc`/`xmlns:content` namespace
//   attributes) is dropped: the old implementation set both `description` and `content` to
//   the exact same value, so nothing is lost — the content still appears once, in
//   `<description>`. Nothing in this repo re-parses `buildRssXml()`'s own output (every
//   `content:encoded` consumer parses feeds crawled from *other* sites), so this is safe.
// - Per-item element order follows feedsmith's `Rss.Item` field order (title, link,
//   description, categories, guid, pubDate) instead of the old order.
// - The document now ends with a trailing newline after `</rss>`.
const channel: RssChannel = {
  title: 'Latest Posts',
  link: 'https://example.com',
  description: 'Recent posts & updates',
  lastBuildDate: new Date('2024-01-15T10:30:00.000Z'),
}

const items: RssItem[] = [
  {
    title: 'First Post & <Title>',
    link: 'https://example.com/post/first-post',
    description: '<p>Body with <strong>HTML</strong> &amp; entities</p>',
    pubDate: new Date('2024-01-14T08:00:00.000Z'),
    guid: 'post-guid-1',
    categories: ['Tech', 'News & Views'],
  },
  {
    title: 'Second post, plain',
    link: 'https://example.com/post/second-post?utm_source=rss&ref=x',
    description: 'Plain text body with no special characters at all here',
    pubDate: new Date('2024-01-13T08:00:00.000Z'),
    guid: 'post-guid-2',
    categories: [],
  },
]

describe('buildRssXml', () => {
  it('round-trips a guid and link containing "&" to their exact original string', () => {
    // Regression test for the CDATA_WHITESPACE_REGEX collapse. news-feed guids/links are
    // external article URLs and routinely carry query strings with `&` (utm params, etc.),
    // which trips feedsmith's CDATA-wrap condition on both <guid> and <link>. Without the
    // collapse, format:true would place the wrapped value on its own indented line, and a
    // guid read back with injected whitespace would not match the original URL — a subscriber-
    // visible identity change for every affected item. Both fields must render as a single
    // inline CDATA section whose content is byte-identical to the input.
    const url = 'https://external.example.com/article?utm_source=rss&ref=abc'
    const xml = buildRssXml(
      { title: 'News', link: 'https://example.com', description: 'News feed' },
      [{ title: 'Article', link: url, description: 'plain', guid: url }],
    )

    expect(xml).toContain(`<link><![CDATA[${url}]]></link>`)
    expect(xml).toContain(`<guid isPermaLink="false"><![CDATA[${url}]]></guid>`)
  })

  it('pins the full generated RSS document', () => {
    expect(buildRssXml(channel, items)).toBe(
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<rss version="2.0">',
        '  <channel>',
        '    <title>Latest Posts</title>',
        '    <link>https://example.com</link>',
        '    <description><![CDATA[Recent posts & updates]]></description>',
        '    <language>en</language>',
        '    <lastBuildDate>Mon, 15 Jan 2024 10:30:00 GMT</lastBuildDate>',
        '    <item>',
        '      <title><![CDATA[First Post & <Title>]]></title>',
        '      <link>https://example.com/post/first-post</link>',
        '      <description><![CDATA[<p>Body with <strong>HTML</strong> &amp; entities</p>]]></description>',
        '      <category>Tech</category>',
        '      <category><![CDATA[News & Views]]></category>',
        '      <guid isPermaLink="false">post-guid-1</guid>',
        '      <pubDate>Sun, 14 Jan 2024 08:00:00 GMT</pubDate>',
        '    </item>',
        '    <item>',
        '      <title>Second post, plain</title>',
        '      <link><![CDATA[https://example.com/post/second-post?utm_source=rss&ref=x]]></link>',
        '      <description>Plain text body with no special characters at all here</description>',
        '      <guid isPermaLink="false">post-guid-2</guid>',
        '      <pubDate>Sat, 13 Jan 2024 08:00:00 GMT</pubDate>',
        '    </item>',
        '  </channel>',
        '</rss>',
        '',
      ].join('\n'),
    )
  })
})
