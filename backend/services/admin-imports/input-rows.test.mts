import { describe, expect, it } from 'vitest'
import { rssFeedColumns } from './input-rows.mts'

describe('rssFeedColumns', () => {
  it('keeps an explicit follow boolean', () => {
    expect(rssFeedColumns({ url: 'https://example.com/rss', follow: true })).toEqual({
      url: 'https://example.com/rss',
      follow: true,
    })
  })
})
