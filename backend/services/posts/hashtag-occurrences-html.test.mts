import { describe, expect, it } from 'vitest'
import { getPostHashtagOccurrences } from './hashtag-occurrences.mts'

describe('getPostHashtagOccurrences HTML handling', () => {
  it('excludes hashtags from non-visible and code element contents', () => {
    const markdown = [
      '<script>const category = "#hidden-script"</script>',
      '<style>.#hidden-style {}</style>',
      '<pre><code>#hidden-pre-code</code></pre>',
      '<code>#hidden-code</code>',
      '#visible',
    ].join('')

    expect(getPostHashtagOccurrences({ markdown })).toEqual([
      { key: 'visible', authored: '#visible', source: 'markdown' },
    ])
  })

  it('handles mixed and same-name nested code elements', () => {
    const markdown = [
      '<pre><code>#hidden-mixed</code></pre>',
      '<code>outer <code>#hidden-inner</code> #hidden-outer</code>',
      '#visible',
    ].join(' ')

    expect(getPostHashtagOccurrences({ markdown })).toEqual([
      { key: 'visible', authored: '#visible', source: 'markdown' },
    ])
  })

  it('masks an unclosed code element through the end of the input', () => {
    expect(getPostHashtagOccurrences({ markdown: '#before <pre>#hidden-unclosed' })).toEqual([
      { key: 'before', authored: '#before', source: 'markdown' },
    ])
  })
})
