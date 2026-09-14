import { describe, expect, it } from 'vitest'
import { metadata } from './page'

describe('staff review queue page metadata', () => {
  it('keeps the staff queue out of search indexes', () => {
    expect(metadata).toMatchObject({
      title: 'Review Queue | Staff',
      robots: { index: false, follow: false },
    })
  })
})
