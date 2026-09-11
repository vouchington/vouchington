import { JSDOM } from 'jsdom'
import { expect } from 'vitest'

export function parseHtml(html: string, url: string): Document {
  return new JSDOM(html, { url }).window.document
}

export function getMetaContent(document: Document, selector: string): string {
  return document.querySelector(selector)?.getAttribute('content')?.trim() ?? ''
}

export function getLinkHref(document: Document, selector: string): string {
  return document.querySelector(selector)?.getAttribute('href')?.trim() ?? ''
}

export function getJsonLd(document: Document): unknown[] {
  return Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap(
    (script, index) => {
      const content = script.textContent?.trim()
      if (!content) return []

      try {
        return [JSON.parse(content) as unknown]
      } catch (cause) {
        throw new Error(
          `Failed to parse JSON-LD script ${index} on ${document.URL}: ${content.slice(0, 160)}`,
          { cause },
        )
      }
    },
  )
}

export function findSchema<T extends Record<string, unknown>>(
  schemas: unknown[],
  type: string,
): T | undefined {
  return schemas.find(
    (schema): schema is T =>
      typeof schema === 'object' &&
      schema !== null &&
      (schema as Record<string, unknown>)['@type'] === type,
  )
}

export function expectBreadcrumbHtml(document: Document): void {
  const nav = document.querySelector('nav[aria-label="breadcrumb"]')
  expect(nav).toBeTruthy()
  expect(nav?.textContent ?? '').toContain('Home')
}

export function expectNoBlankExternalLinksWithoutRel(document: Document): void {
  const violations = Array.from(document.querySelectorAll('a[target="_blank"]')).flatMap(link => {
    const rel = link.getAttribute('rel') ?? ''
    if (!rel.includes('nofollow') || !rel.includes('noopener') || !rel.includes('noreferrer')) {
      return [link.outerHTML.slice(0, 160)]
    }
    return []
  })

  expect(violations).toEqual([])
}
