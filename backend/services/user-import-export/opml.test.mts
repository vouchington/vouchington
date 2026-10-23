import { describe, expect, it } from 'vitest'
import { parseOpmlOutlines } from './opml.mts'

describe('parseOpmlOutlines', () => {
  it('parses standard OPML with RSS outlines', () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Feeds</title></head>
  <body>
    <outline text="Example Feed" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com" type="rss" />
    <outline text="Another Feed" xmlUrl="https://other.com/rss" type="rss" />
  </body>
</opml>`

    expect(Array.from(parseOpmlOutlines(opml))).toEqual([
      {
        text: 'Example Feed',
        xmlUrl: 'https://example.com/feed.xml',
        htmlUrl: 'https://example.com',
      },
      { text: 'Another Feed', xmlUrl: 'https://other.com/rss', htmlUrl: null },
    ])
  })

  it('parses nested OPML outlines (folders)', () => {
    const opml = `<opml><body><outline text="Tech"><outline text="TechCrunch" xmlUrl="https://techcrunch.com/feed/" htmlUrl="https://techcrunch.com" type="rss" /></outline></body></opml>`

    expect(Array.from(parseOpmlOutlines(opml))).toEqual([
      {
        text: 'TechCrunch',
        xmlUrl: 'https://techcrunch.com/feed/',
        htmlUrl: 'https://techcrunch.com',
      },
    ])
  })

  it('decodes XML entities in attributes', () => {
    const opml = `<opml><body><outline text="Tom &amp; Jerry&apos;s Feed" xmlUrl="https://example.com/feed.xml" /></body></opml>`

    expect(Array.from(parseOpmlOutlines(opml))).toEqual([
      { text: "Tom & Jerry's Feed", xmlUrl: 'https://example.com/feed.xml', htmlUrl: null },
    ])
  })

  it('uses the title attribute when text is missing', () => {
    const opml = `<opml><body><outline title="Feed Title" xmlUrl="https://example.com/rss" /></body></opml>`

    expect(Array.from(parseOpmlOutlines(opml))).toEqual([
      { text: 'Feed Title', xmlUrl: 'https://example.com/rss', htmlUrl: null },
    ])
  })

  it('uses an empty text when text and title attributes are missing', () => {
    const opml = `<opml><body><outline xmlUrl="https://example.com/rss" /></body></opml>`

    expect(Array.from(parseOpmlOutlines(opml))).toEqual([
      { text: '', xmlUrl: 'https://example.com/rss', htmlUrl: null },
    ])
  })

  it('skips outlines without xmlUrl', () => {
    const opml = `<opml><body><outline text="Folder" /><outline text="Empty URL" xmlUrl="" /></body></opml>`
    expect(Array.from(parseOpmlOutlines(opml))).toEqual([])
  })

  it('yields nothing for empty input', () => {
    expect(Array.from(parseOpmlOutlines(''))).toEqual([])
  })

  it('can be used to map URLs lazily', () => {
    const opml = `<opml><body>
      <outline text="Test" xmlUrl="https://test.example.com/rss" />
    </body></opml>`

    const urls = Array.from(parseOpmlOutlines(opml), o => o.xmlUrl)
    expect(urls).toEqual(['https://test.example.com/rss'])
  })
})
