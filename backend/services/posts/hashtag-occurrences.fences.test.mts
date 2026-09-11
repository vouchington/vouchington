import { describe, expect, it } from 'vitest'
import { getPostHashtagOccurrences } from './hashtag-occurrences.mts'

describe('getPostHashtagOccurrences fenced Markdown boundaries', () => {
  it('stops an unclosed fenced block when its list container ends', () => {
    expect(
      getPostHashtagOccurrences({
        markdown: ['- ```typescript', '  #hidden', '#visible'].join('\n'),
      }),
    ).toEqual([{ key: 'visible', authored: '#visible', source: 'markdown' }])
  })

  it('does not close an inline code span from within a longer backtick run', () => {
    expect(getPostHashtagOccurrences({ markdown: '`#visible`` #also-visible' })).toEqual([
      { key: 'visible', authored: '#visible', source: 'markdown' },
      { key: 'also-visible', authored: '#also-visible', source: 'markdown' },
    ])
  })
})
