import { describe, expect, it } from 'vitest'
import { createItemListSchema } from '../../structured-data'

describe('createItemListSchema', () => {
  it('sets @context and @type correctly', () => {
    const schema = createItemListSchema([], 'Test List')

    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('ItemList')
  })

  it('sets the list name', () => {
    const schema = createItemListSchema([], 'My List')

    expect(schema.name).toBe('My List')
  })

  it('sets numberOfItems to the length of the items array', () => {
    const items = [
      { name: 'Item A', url: 'https://voucha.ai/a' },
      { name: 'Item B', url: 'https://voucha.ai/b' },
    ]
    const schema = createItemListSchema(items, 'Test')

    expect(schema.numberOfItems).toBe(2)
  })

  it('generates 1-based positions for each ListItem', () => {
    const items = [
      { name: 'First', url: 'https://voucha.ai/first' },
      { name: 'Second', url: 'https://voucha.ai/second' },
      { name: 'Third', url: 'https://voucha.ai/third' },
    ]
    const schema = createItemListSchema(items, 'Test')
    const elements = schema.itemListElement as Array<{ position: number; name: string }>

    expect(elements[0]!.position).toBe(1)
    expect(elements[1]!.position).toBe(2)
    expect(elements[2]!.position).toBe(3)
  })

  it('sets name and url on each ListItem', () => {
    const items = [{ name: 'Voucha News', url: 'https://voucha.ai/news' }]
    const schema = createItemListSchema(items, 'News')
    const elements = schema.itemListElement as Array<Record<string, unknown>>

    expect(elements[0]!['@type']).toBe('ListItem')
    expect(elements[0]!.name).toBe('Voucha News')
    expect(elements[0]!.url).toBe('https://voucha.ai/news')
  })

  it('includes optional description when provided', () => {
    const items = [{ name: 'News', url: 'https://voucha.ai/news', description: 'Latest news' }]
    const schema = createItemListSchema(items, 'Test')
    const elements = schema.itemListElement as Array<Record<string, unknown>>

    expect(elements[0]!.description).toBe('Latest news')
  })

  it('omits description when not provided', () => {
    const items = [{ name: 'News', url: 'https://voucha.ai/news' }]
    const schema = createItemListSchema(items, 'Test')
    const elements = schema.itemListElement as Array<Record<string, unknown>>

    expect(elements[0]).not.toHaveProperty('description')
  })

  it('includes optional image when provided', () => {
    const items = [
      { name: 'Source', url: 'https://voucha.ai/sources', image: 'https://voucha.ai/img.png' },
    ]
    const schema = createItemListSchema(items, 'Test')
    const elements = schema.itemListElement as Array<Record<string, unknown>>

    expect(elements[0]!.image).toBe('https://voucha.ai/img.png')
  })

  it('omits image when not provided', () => {
    const items = [{ name: 'Source', url: 'https://voucha.ai/sources' }]
    const schema = createItemListSchema(items, 'Test')
    const elements = schema.itemListElement as Array<Record<string, unknown>>

    expect(elements[0]).not.toHaveProperty('image')
  })

  it('returns an empty itemListElement array when no items are provided', () => {
    const schema = createItemListSchema([], 'Empty List')

    expect(schema.numberOfItems).toBe(0)
    expect(schema.itemListElement).toEqual([])
  })
})
