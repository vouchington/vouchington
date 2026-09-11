import { describe, expect, it } from 'vitest'
import { parseOpml, parseOpmlOutlines, generateOpml, type OpmlOutline } from './opml.mts'

describe('parseOpml', () => {
  it('parses standard OPML with RSS outlines', () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>My Feeds</title></head>
  <body>
    <outline text="Example Feed" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com" type="rss" />
    <outline text="Another Feed" xmlUrl="https://other.com/rss" type="rss" />
  </body>
</opml>`

    const outlines = parseOpml(opml)
    expect(outlines).toHaveLength(2)
    expect(outlines[0]).toEqual({
      text: 'Example Feed',
      xmlUrl: 'https://example.com/feed.xml',
      htmlUrl: 'https://example.com',
    })
    expect(outlines[1]).toEqual({
      text: 'Another Feed',
      xmlUrl: 'https://other.com/rss',
      htmlUrl: null,
    })
  })

  it('parses nested OPML outlines (folders)', () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="TechCrunch" xmlUrl="https://techcrunch.com/feed/" htmlUrl="https://techcrunch.com" type="rss" />
    </outline>
  </body>
</opml>`

    const outlines = parseOpml(opml)
    expect(outlines).toHaveLength(1)
    expect(outlines[0]!.text).toBe('TechCrunch')
  })

  it('handles XML entities in attributes', () => {
    const opml = `<opml><body>
      <outline text="Tom &amp; Jerry&apos;s Feed" xmlUrl="https://example.com/feed.xml" />
    </body></opml>`

    const outlines = parseOpml(opml)
    expect(outlines).toHaveLength(1)
    expect(outlines[0]!.text).toBe("Tom & Jerry's Feed")
  })

  it('returns empty array for OPML with no RSS outlines', () => {
    const opml = `<opml><body>
      <outline text="Folder" />
    </body></opml>`

    expect(parseOpml(opml)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseOpml('')).toEqual([])
  })

  it('uses title attribute as fallback for text', () => {
    const opml = `<opml><body>
      <outline title="Feed Title" xmlUrl="https://example.com/rss" />
    </body></opml>`

    const outlines = parseOpml(opml)
    expect(outlines[0]!.text).toBe('Feed Title')
  })
})

describe('parseOpmlOutlines', () => {
  it('yields the same outlines as parseOpml', () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Feed A" xmlUrl="https://a.example.com/rss" type="rss" />
    <outline text="Feed B" xmlUrl="https://b.example.com/feed.xml" htmlUrl="https://b.example.com" type="rss" />
  </body>
</opml>`

    const fromGenerator = Array.from(parseOpmlOutlines(opml))
    const fromParse = parseOpml(opml)

    expect(fromGenerator).toHaveLength(2)
    expect(fromGenerator).toEqual(fromParse)
  })

  it('yields nothing for OPML with no xmlUrl outlines', () => {
    const opml = `<opml><body><outline text="Folder" /></body></opml>`
    expect(Array.from(parseOpmlOutlines(opml))).toHaveLength(0)
  })

  it('yields nothing for empty string', () => {
    expect(Array.from(parseOpmlOutlines(''))).toHaveLength(0)
  })

  it('can be used to map URLs lazily', () => {
    const opml = `<opml><body>
      <outline text="Test" xmlUrl="https://test.example.com/rss" />
    </body></opml>`

    const urls = Array.from(parseOpmlOutlines(opml), o => o.xmlUrl)
    expect(urls).toEqual(['https://test.example.com/rss'])
  })
})

describe('generateOpml', () => {
  it('generates valid OPML from feed list', () => {
    const feeds: OpmlOutline[] = [
      {
        text: 'Example Feed',
        xmlUrl: 'https://example.com/feed.xml',
        htmlUrl: 'https://example.com',
      },
      { text: 'Simple Feed', xmlUrl: 'https://simple.com/rss', htmlUrl: null },
    ]

    const opml = generateOpml(feeds, 'My Export')
    expect(opml).toContain('<?xml version="1.0"')
    expect(opml).toContain('<title>My Export</title>')
    expect(opml).toContain('xmlUrl="https://example.com/feed.xml"')
    expect(opml).toContain('htmlUrl="https://example.com"')
    expect(opml).toContain('xmlUrl="https://simple.com/rss"')
    expect(opml).not.toContain('htmlUrl=""')
  })

  it('escapes XML special characters', () => {
    const feeds: OpmlOutline[] = [
      { text: "Tom & Jerry's <Feed>", xmlUrl: 'https://example.com/feed.xml', htmlUrl: null },
    ]

    const opml = generateOpml(feeds)
    expect(opml).toContain('Tom &amp; Jerry&#39;s &lt;Feed&gt;')
  })

  it('generates empty OPML body for empty list', () => {
    const opml = generateOpml([])
    expect(opml).toContain('<body>')
    expect(opml).toContain('</body>')
    expect(opml).not.toContain('<outline')
  })

  it('roundtrips through parse', () => {
    const feeds: OpmlOutline[] = [
      { text: 'Test Feed', xmlUrl: 'https://example.com/feed.xml', htmlUrl: 'https://example.com' },
    ]

    const opml = generateOpml(feeds)
    const parsed = parseOpml(opml)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.text).toBe('Test Feed')
    expect(parsed[0]!.xmlUrl).toBe('https://example.com/feed.xml')
    expect(parsed[0]!.htmlUrl).toBe('https://example.com')
  })
})
