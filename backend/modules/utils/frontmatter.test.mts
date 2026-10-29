import { describe, it, expect } from 'vitest'
import { toFrontmatter } from './frontmatter.mts'

describe('toFrontmatter', () => {
  it('preserves scalar fields including zero, false, and empty strings', () => {
    const result = toFrontmatter({ title: 'Hello World', count: 0, active: false, empty: '' })
    expect(result).toBe('---\ntitle: Hello World\ncount: 0\nactive: false\nempty: ""\n---')
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
})
