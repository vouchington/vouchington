import { describe, expect, it } from 'vitest'
import { getPostHashtagOccurrences } from './hashtag-occurrences.mts'

describe('getPostHashtagOccurrences', () => {
  it('excludes trailing punctuation from a hashtag token', () => {
    expect(getPostHashtagOccurrences({ markdown: '#Credit.Cards_, #caf\u00e9, #banks!' })).toEqual([
      { key: 'credit-cards', authored: '#Credit.Cards', source: 'markdown' },
      { key: 'banks', authored: '#banks', source: 'markdown' },
    ])
  })

  it('keeps hashtags in Markdown link labels while excluding URL fragments', () => {
    expect(
      getPostHashtagOccurrences({
        markdown:
          '[Browse #Credit.Cards](https://example.test/#ignored) https://example.test/#also-ignored',
      }),
    ).toEqual([{ key: 'credit-cards', authored: '#Credit.Cards', source: 'markdown' }])
  })

  it('excludes URL fragments from post titles', () => {
    expect(
      getPostHashtagOccurrences({
        title: 'Read https://example.test/#ignored and www.example.test/#also-ignored #visible',
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'title' }])
  })

  it('does not extract fragments from bare URLs with balanced parentheses', () => {
    expect(
      getPostHashtagOccurrences({
        markdown:
          'https://en.wikipedia.org/wiki/Foo_(bar)#History https://en.wikipedia.org/wiki/Foo_(bar_(baz))#Nested #visible',
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })
  it('decodes Markdown character references in visible hashtag text', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: '&num;travel &#35;food #credit&#45;cards',
      }),
    ).toEqual([
      { key: 'travel', authored: '#travel', source: 'markdown' },
      { key: 'food', authored: '#food', source: 'markdown' },
      { key: 'credit-cards', authored: '#credit-cards', source: 'markdown' },
    ])
  })

  it('does not decode escaped references or categorize encoded URL fragments', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: String.raw`\&num;literal /docs&num;fragment https://example.test/&num;remote #visible`,
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('keeps hashtags inside Markdown-like title syntax', () => {
    expect(
      getPostHashtagOccurrences({
        title: 'Discuss `#travel`, ![#images](image.png), and [#guides](/guides)',
      }),
    ).toEqual([
      { key: 'travel', authored: '#travel', source: 'title' },
      { key: 'images', authored: '#images', source: 'title' },
      { key: 'guides', authored: '#guides', source: 'title' },
    ])
  })

  it('does not extract hashtags from image alt text', () => {
    expect(
      getPostHashtagOccurrences({ markdown: '![#not-a-category](https://example.com/image.jpg)' }),
    ).toEqual([])
  })

  it('does not extract hashtags from image destinations with balanced parentheses or fragments', () => {
    expect(
      getPostHashtagOccurrences({
        markdown:
          '![#hidden-alt](https://example.test/images/(nested)/photo.png#hidden-fragment) #visible',
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('does not extract hashtags from reference image alt text', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: '![#hidden][image]\n\n[image]: https://example.test/image.png #visible',
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('does not extract fragments or titles from valid link-reference definitions', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: [
          '#before',
          '',
          '[guide]: https://example.test/docs/(v2)#hidden "Guide to #hidden-title"',
          "[image]: <https://example.test/image.png#hidden-image>\n  'Image #hidden-caption'",
          '',
          '#after',
        ].join('\n'),
      }),
    ).toEqual([
      { key: 'before', authored: '#before', source: 'markdown' },
      { key: 'after', authored: '#after', source: 'markdown' },
    ])
  })

  it('does not extract definition labels or blockquoted definitions', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: [
          '[#hidden-label]: https://example.test/#hidden-fragment',
          '> [#hidden-quote]: <#hidden-destination>',
          '> > [nested]: /docs/#hidden-nested',
          '#visible',
        ].join('\n'),
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('extracts link labels but not balanced link destination fragments', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: '[#visible](https://example.test/img_(v2)#hidden)',
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('does not extract linked image alt text', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: '[![#hidden](image.png)](https://example.test) #visible',
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('does not extract fragments from schemeless or relative URLs', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: 'www.example.test/#pricing /docs/#install #real-category',
      }),
    ).toEqual([{ key: 'real-category', authored: '#real-category', source: 'markdown' }])
  })

  it('does not extract hashtags from tilde or open-ended fenced code blocks', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: [
          '#visible',
          '~~~typescript',
          'const tag = "#hidden-tilde"',
          '~~~~',
          '#also-visible',
          '```',
          '#hidden-through-eof',
        ].join('\n'),
      }),
    ).toEqual([
      { key: 'visible', authored: '#visible', source: 'markdown' },
      { key: 'also-visible', authored: '#also-visible', source: 'markdown' },
    ])
  })

  it('does not treat a backtick fence with a backtick in its info string as code', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: ['```typescript`', '#visible', '~~~typescript`', '#hidden', '~~~'].join('\n'),
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('does not extract hashtags from tilde fences nested inside list items', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: ['- ~~~', '  #hidden', '  ~~~', '#visible'].join('\n'),
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('does not extract hashtags from fences in nested list and blockquote containers', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: [
          '- > ~~~',
          '  > #hidden-unordered',
          '  > ~~~',
          '',
          '> 1. > ```',
          '>    > #hidden-ordered',
          '>    > ```',
          '#visible',
        ].join('\n'),
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('accepts flexible blockquote spacing on a fenced block closing line', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: ['>  ~~~', '> #hidden', '> ~~~', '> #visible'].join('\n'),
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('does not extract hashtags from fenced code inside nested blockquotes', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: [
          '> > ~~~typescript',
          '> > const tag = "#hidden"',
          '> > ~~~',
          '',
          '#visible',
        ].join('\n'),
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('ends an unclosed fenced block when its blockquote ends', () => {
    expect(getPostHashtagOccurrences({ markdown: '> ```\n> #hidden\noutside #visible' })).toEqual([
      { key: 'visible', authored: '#visible', source: 'markdown' },
    ])
  })

  it('does not extract hashtags from indented code blocks', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: ['#visible', '', '    #hidden-spaces', '\t#hidden-tab', '  #also-visible'].join(
          '\n',
        ),
      }),
    ).toEqual([
      { key: 'visible', authored: '#visible', source: 'markdown' },
      { key: 'also-visible', authored: '#also-visible', source: 'markdown' },
    ])
  })

  it('keeps hashtags in indented paragraph and list continuations', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: [
          'A paragraph that continues',
          '    with #paragraph-continuation.',
          '',
          '- A list item',
          '',
          '    with #list-continuation.',
        ].join('\n'),
      }),
    ).toEqual([
      { key: 'paragraph-continuation', authored: '#paragraph-continuation', source: 'markdown' },
      { key: 'list-continuation', authored: '#list-continuation', source: 'markdown' },
    ])
  })

  it('does not extract hashtags from blockquoted indented code', () => {
    expect(getPostHashtagOccurrences({ markdown: '>     #hidden-code' })).toEqual([])
  })

  it('does not extract hashtags from code indented within a list item', () => {
    expect(getPostHashtagOccurrences({ markdown: '- item\n\n      #hidden-code' })).toEqual([])
  })

  it('does not extract hashtags from variable-length inline code spans', () => {
    expect(
      getPostHashtagOccurrences({ markdown: 'Keep ``#hidden ` code`` but #visible.' }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('honors Markdown backslash parity when finding hashtags', () => {
    expect(
      getPostHashtagOccurrences({ markdown: String.raw`\#hidden \\#visible \\\#also-hidden` }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('keeps hashtags following ordinary angle-bracket comparisons', () => {
    expect(getPostHashtagOccurrences({ markdown: 'I think 2 < 3 so #math > 1.' })).toEqual([
      { key: 'math', authored: '#math', source: 'markdown' },
    ])
  })

  it('excludes hashtags in HTML tags and autolinks', () => {
    expect(
      getPostHashtagOccurrences({
        markdown:
          '<span data-category="#hidden">#inside</span> <https://example.test/#ignored> #visible',
      }),
    ).toEqual([
      { key: 'inside', authored: '#inside', source: 'markdown' },
      { key: 'visible', authored: '#visible', source: 'markdown' },
    ])
  })

  it('does not return an authored token that exceeds the storage limit', () => {
    expect(getPostHashtagOccurrences({ markdown: `#${'_'.repeat(255)}a` })).toEqual([])
  })
})
