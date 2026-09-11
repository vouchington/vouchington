import { describe, it, expect } from 'vitest'
import { toFrontmatter } from './frontmatter.mts'

describe('toFrontmatter', () => {
  it('should serialize basic key-value pairs', () => {
    const result = toFrontmatter({ title: 'Hello World', count: 42, active: true })
    expect(result).toBe('---\ntitle: Hello World\ncount: 42\nactive: true\n---')
  })

  it('should skip null and undefined values', () => {
    const result = toFrontmatter({ title: 'Test', missing: null, undef: undefined })
    expect(result).toBe('---\ntitle: Test\n---')
  })

  it('should serialize dates as ISO strings', () => {
    const date = new Date('2024-01-15T12:00:00.000Z')
    const result = toFrontmatter({ created_at: date })
    expect(result).toBe('---\ncreated_at: 2024-01-15T12:00:00.000Z\n---')
  })

  it('should quote strings with colons', () => {
    const result = toFrontmatter({ url: 'https://example.com' })
    expect(result).toBe('---\nurl: "https://example.com"\n---')
  })

  it('should quote strings with hash characters', () => {
    const result = toFrontmatter({ tag: '#trending' })
    expect(result).toBe('---\ntag: "#trending"\n---')
  })

  it('should quote strings with double quotes', () => {
    const result = toFrontmatter({ title: 'Say "hello"' })
    expect(result).toBe('---\ntitle: "Say \\"hello\\""\n---')
  })

  it('should quote YAML keywords and numeric strings', () => {
    const result = toFrontmatter({ yes: 'yes', count: '42' })
    expect(result).toBe('---\nyes: "yes"\ncount: "42"\n---')
  })

  it('should quote strings starting with dash', () => {
    const result = toFrontmatter({ note: '- item' })
    expect(result).toBe('---\nnote: "- item"\n---')
  })

  it('should quote empty strings', () => {
    const result = toFrontmatter({ empty: '' })
    expect(result).toBe('---\nempty: ""\n---')
  })

  it('should skip empty arrays', () => {
    const result = toFrontmatter({ tags: [], title: 'Test' })
    expect(result).toBe('---\ntitle: Test\n---')
  })

  it('should serialize arrays of primitives', () => {
    const result = toFrontmatter({ tags: ['foo', 'bar'] })
    expect(result).toBe('---\ntags:\n  - foo\n  - bar\n---')
  })

  it('should skip null and undefined array entries', () => {
    const result = toFrontmatter({ tags: ['foo', null, undefined, 'bar'] })
    expect(result).toBe('---\ntags:\n  - foo\n  - bar\n---')
  })

  it('should serialize arrays of objects', () => {
    const result = toFrontmatter({
      authors: [
        { name: 'Alice', role: 'admin' },
        { name: 'Bob', role: 'user' },
      ],
    })
    expect(result).toBe(
      '---\nauthors:\n  - name: Alice\n    role: admin\n  - name: Bob\n    role: user\n---',
    )
  })

  it('should skip null values in object array entries', () => {
    const result = toFrontmatter({
      items: [{ name: 'Test', optional: null }],
    })
    expect(result).toBe('---\nitems:\n  - name: Test\n---')
  })

  it('preserves the legacy shallow scalarization for top-level nested objects', () => {
    const result = toFrontmatter({
      nested: { child: { enabled: true, omitted: null }, empty: [] },
    })
    expect(result).toBe('---\nnested: "[object Object]"\n---')
  })

  it('should quote strings with newlines', () => {
    const result = toFrontmatter({ note: 'line1\nline2' })
    expect(result).toBe('---\nnote: "line1\\nline2"\n---')
  })

  it('should quote strings with tabs', () => {
    const result = toFrontmatter({ note: 'a\tb' })
    expect(result).toBe('---\nnote: "a\\tb"\n---')
  })

  it('should handle an empty record', () => {
    const result = toFrontmatter({})
    expect(result).toBe('---\n---')
  })
})
