import { describe, expect, it } from 'vitest'
import { createItemListSchema } from '../../structured-data'

describe('createItemListSchema', () => {
  it('sets name and url on each ListItem', () => {
    const items = [{ name: 'Voucha News', url: '/news' }]
    const schema = createItemListSchema(items, 'News')
    const elements = schema.itemListElement as Array<Record<string, unknown>>

    expect(elements[0]!.name).toBe('Voucha News')
    expect(elements[0]!.url).toBe('https://voucha.ai/news')
  })
})
