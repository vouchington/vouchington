import { describe, it, expect } from 'vitest'
import { parseFrontmatter, extractTitleFromMarkdown } from './parse.mts'

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const content = `---
title: "My Article"
slug: my-article
post_type: article
topics:
  - voucha
---
# My Article

Body content here.`

    const result = parseFrontmatter(content)
    expect(result.frontmatter.title).toBe('My Article')
    expect(result.frontmatter.slug).toBe('my-article')
    expect(result.frontmatter.post_type).toBe('article')
    expect(result.frontmatter.topics).toEqual(['voucha'])
    expect(result.body).toBe('# My Article\n\nBody content here.')
  })

  it('returns empty frontmatter when none exists', () => {
    const content = '# Plain Article\n\nNo frontmatter here.'
    const result = parseFrontmatter(content)
    expect(result.frontmatter).toEqual({})
    expect(result.body).toBe(content)
  })

  it('handles frontmatter without topics', () => {
    const content = `---
title: "Terms of Service"
slug: terms-of-service
post_type: article
---
# Terms of Service

Legal text here.`

    const result = parseFrontmatter(content)
    expect(result.frontmatter.title).toBe('Terms of Service')
    expect(result.frontmatter.slug).toBe('terms-of-service')
    expect(result.frontmatter.topics).toBeUndefined()
    expect(result.body).toContain('Legal text here.')
  })

  it('preserves body delimiters after frontmatter', () => {
    const content = `---
title: "Delimiter Article"
---
Body with --- inside

---
not frontmatter`

    const result = parseFrontmatter(content)
    expect(result.frontmatter.title).toBe('Delimiter Article')
    expect(result.body).toBe('Body with --- inside\n\n---\nnot frontmatter')
  })

  it('handles CRLF line endings', () => {
    const content = '---\r\ntitle: "CRLF Article"\r\nslug: crlf\r\n---\r\nBody with CRLF.'
    const result = parseFrontmatter(content)
    expect(result.frontmatter.title).toBe('CRLF Article')
    expect(result.frontmatter.slug).toBe('crlf')
    expect(result.body).toBe('Body with CRLF.')
  })

  it('handles partial frontmatter', () => {
    const content = `---
title: "Just a Title"
---
Body.`

    const result = parseFrontmatter(content)
    expect(result.frontmatter.title).toBe('Just a Title')
    expect(result.frontmatter.slug).toBeUndefined()
    expect(result.frontmatter.post_type).toBeUndefined()
    expect(result.body).toBe('Body.')
  })

  it('falls back to body content for a dangling frontmatter opener', () => {
    const content = `---
title: "Broken Article"
Body without closing`

    const result = parseFrontmatter(content)
    expect(result.frontmatter).toEqual({})
    expect(result.body).toBe(content)
  })

  it('throws for invalid YAML in a complete frontmatter block', () => {
    const content = `---
title: [
---
# Broken Article`

    expect(() => parseFrontmatter(content)).toThrow(/unexpected end of the stream/)
  })

  it('preserves coerced post_type for downstream validation while still filtering other fields', () => {
    const content = `---
title: 12:30:45
slug: 12:30:45
post_type: 12:30:45
topics:
  - politics
  - 12:30:45
---
# Coerced Article`

    const result = parseFrontmatter(content)
    expect(result.frontmatter.title).toBeUndefined()
    expect(result.frontmatter.slug).toBeUndefined()
    expect(result.frontmatter.post_type).toBe(45045)
    expect(result.frontmatter.topics).toEqual(['politics'])
    expect(result.body).toBe('# Coerced Article')
  })
})

describe('extractTitleFromMarkdown', () => {
  it('extracts title from h1 heading', () => {
    expect(extractTitleFromMarkdown('# My Article Title\n\nBody')).toBe('My Article Title')
  })

  it('extracts title from h1 not at start of content', () => {
    expect(extractTitleFromMarkdown('\n\n# Title After Blank Lines\n\nBody')).toBe(
      'Title After Blank Lines',
    )
  })

  it('returns empty string when no h1 exists', () => {
    expect(extractTitleFromMarkdown('## Only H2 Heading\n\nBody')).toBe('')
  })

  it('returns empty string for empty content', () => {
    expect(extractTitleFromMarkdown('')).toBe('')
  })

  it('extracts first h1 when multiple exist', () => {
    expect(extractTitleFromMarkdown('# First\n\n# Second')).toBe('First')
  })

  it('trims whitespace from title', () => {
    expect(extractTitleFromMarkdown('#   Spaced Title   \n')).toBe('Spaced Title')
  })
})
