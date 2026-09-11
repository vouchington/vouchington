import type { DefaultTreeAdapterMap } from 'parse5'
import { isAllowedAttribute } from './safe-html-fragment-allowed-attributes'
import { isSafeImageUrl, isSafeLinkUrl } from './safe-html-fragment-url'

type HtmlAttribute = DefaultTreeAdapterMap['element']['attrs'][number]

export function renderAttributes(tagName: string, attrs: HtmlAttribute[]): string {
  const allowedAttrs: HtmlAttribute[] = []

  for (const attr of attrs) {
    const name = attr.name.toLowerCase()
    if (!isAllowedAttribute(tagName, name)) continue
    if (name === 'href' && !isSafeLinkUrl(attr.value)) continue
    if (name === 'src' && !isSafeImageUrl(attr.value)) continue

    allowedAttrs.push({ name, value: attr.value })
  }

  enforceBlankTargetRel(tagName, allowedAttrs)

  const rendered = allowedAttrs.map(attr => `${attr.name}="${escapeAttributeValue(attr.value)}"`)
  return rendered.length > 0 ? ` ${rendered.join(' ')}` : ''
}

function enforceBlankTargetRel(tagName: string, attrs: HtmlAttribute[]): void {
  if (tagName !== 'a') return
  if (!attrs.some(attr => attr.name === 'target' && attr.value.trim().toLowerCase() === '_blank')) {
    return
  }

  const rel = attrs.find(attr => attr.name === 'rel')
  const tokens = new Set(rel?.value.toLowerCase().split(/\s+/).filter(Boolean))
  tokens.add('noopener')
  tokens.add('noreferrer')

  if (rel) rel.value = [...tokens].join(' ')
  else attrs.push({ name: 'rel', value: 'noopener noreferrer' })
}

function escapeAttributeValue(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;') // Intentional HTML-escaping chain; see docs/overview/architecture/content-rendering.md.
}
