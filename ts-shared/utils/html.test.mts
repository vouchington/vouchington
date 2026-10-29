import { describe, it, expect } from 'vitest'
import { decodeHtmlEntities, isInsideCode } from './html.mts'

describe('isInsideCode', () => {
  it('returns false outside any code or pre block', () => {
    expect(isInsideCode('hello world', 5)).toBe(false)
  })

  it('returns true inside an open <code> block', () => {
    const text = '<code>hello'
    expect(isInsideCode(text, 8)).toBe(true)
  })

  it('returns false after a closed <code> block', () => {
    const text = '<code>hi</code> hello'
    expect(isInsideCode(text, text.length - 1)).toBe(false)
  })

  it('returns true inside an open <pre> block', () => {
    const text = '<pre>hi'
    expect(isInsideCode(text, 6)).toBe(true)
  })

  it('returns false after a closed <pre> block', () => {
    const text = '<pre>hi</pre> hello'
    expect(isInsideCode(text, text.length - 1)).toBe(false)
  })
})

describe('decodeHtmlEntities', () => {
  it('returns empty string unchanged', () => {
    expect(decodeHtmlEntities('')).toBe('')
  })

  it('returns plain text unchanged', () => {
    expect(decodeHtmlEntities('hello world')).toBe('hello world')
  })

  it('decodes numeric decimal entities', () => {
    expect(decodeHtmlEntities('&#8217;')).toBe('’')
    expect(decodeHtmlEntities('&#8230;')).toBe('…')
    expect(decodeHtmlEntities('&#8220;')).toBe('“')
    expect(decodeHtmlEntities('&#8221;')).toBe('”')
  })

  it('decodes numeric hex entities (lowercase x)', () => {
    expect(decodeHtmlEntities('&#x2019;')).toBe('’')
    expect(decodeHtmlEntities('&#x2026;')).toBe('…')
    expect(decodeHtmlEntities('&#x2122;')).toBe('™')
  })

  it('decodes numeric hex entities (uppercase X)', () => {
    expect(decodeHtmlEntities('&#X2019;')).toBe('’')
  })

  it('decodes common named entities', () => {
    expect(decodeHtmlEntities('&amp;')).toBe('&')
    expect(decodeHtmlEntities('&lt;')).toBe('<')
    expect(decodeHtmlEntities('&gt;')).toBe('>')
    expect(decodeHtmlEntities('&quot;')).toBe('"')
    expect(decodeHtmlEntities('&apos;')).toBe("'")
    expect(decodeHtmlEntities('&nbsp;')).toBe(' ')
    expect(decodeHtmlEntities('&mdash;')).toBe('—')
    expect(decodeHtmlEntities('&ndash;')).toBe('–')
    expect(decodeHtmlEntities('&hellip;')).toBe('…')
    expect(decodeHtmlEntities('&rsquo;')).toBe('’')
    expect(decodeHtmlEntities('&ldquo;')).toBe('“')
    expect(decodeHtmlEntities('&rdquo;')).toBe('”')
    expect(decodeHtmlEntities('&trade;')).toBe('™')
    expect(decodeHtmlEntities('&copy;')).toBe('©')
    expect(decodeHtmlEntities('&reg;')).toBe('®')
    expect(decodeHtmlEntities('&euro;')).toBe('€')
  })

  it('decodes named entities outside the old hand-rolled table', () => {
    expect(decodeHtmlEntities('&yen;')).toBe('¥')
  })

  it('decodes named entities case-insensitively', () => {
    expect(decodeHtmlEntities('&AMP;')).toBe('&')
    expect(decodeHtmlEntities('&LT;')).toBe('<')
    expect(decodeHtmlEntities('&MDASH;')).toBe('—')
    expect(decodeHtmlEntities('&NBSP;')).toBe(' ')
  })

  it('decodes lowercase-starting legacy named entities case-insensitively', () => {
    expect(decodeHtmlEntities('&mDash;')).toBe('—')
    expect(decodeHtmlEntities('&nBsP;')).toBe(' ')
  })

  it('preserves official mixed-case named entity meanings', () => {
    expect(decodeHtmlEntities('&Aacute;')).toBe('Á')
  })

  it('decodes multiple entities in one string', () => {
    expect(decodeHtmlEntities('NASA&#8217;s Artemis II&#8230; &#x2122;')).toBe(
      'NASA’s Artemis II… ™',
    )
  })

  it('decodes mixed named and numeric entities', () => {
    expect(decodeHtmlEntities('AT&amp;T &mdash; &#8220;hello&#8221;')).toBe('AT&T — “hello”')
  })

  it('leaves unknown named entities unchanged', () => {
    expect(decodeHtmlEntities('&unknown;')).toBe('&unknown;')
    expect(decodeHtmlEntities('&foobar;')).toBe('&foobar;')
  })

  it('leaves malformed entities unchanged (no semicolon)', () => {
    expect(decodeHtmlEntities('&amp no semicolon')).toBe('&amp no semicolon')
  })

  it('does not decode invalid code points', () => {
    expect(decodeHtmlEntities('&#xD800;')).toBe('&#xD800;')
    expect(decodeHtmlEntities('&#0;')).toBe('&#0;')
  })

  it('does not decode C0 or C1 control characters', () => {
    expect(decodeHtmlEntities('&#1;')).toBe('&#1;')
    expect(decodeHtmlEntities('&#9;')).toBe('&#9;')
    expect(decodeHtmlEntities('&#x1F;')).toBe('&#x1F;')
    expect(decodeHtmlEntities('&#127;')).toBe('&#127;')
    expect(decodeHtmlEntities('&#x9F;')).toBe('&#x9F;')
  })
})
