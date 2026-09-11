import type { DefaultTreeAdapterMap } from 'parse5'
import { renderAttributes } from './safe-html-fragment-attributes'

type HtmlChildNode = DefaultTreeAdapterMap['childNode']
type HtmlParentNode = DefaultTreeAdapterMap['parentNode']

const ALLOWED_TAGS = new Set(
  'p br a strong em b i u s del h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code table thead tbody tr th td img hr figure figcaption details summary sup sub span div dl dt dd'.split(
    ' ',
  ),
)

const DANGEROUS_TAGS = new Set(
  'script style iframe object embed form input button select textarea meta base svg math template'.split(
    ' ',
  ),
)

const HTML_FRAGMENT_VOID_TAGS = new Set(['br', 'hr', 'img'])

export function renderChildren(node: HtmlParentNode): string {
  return node.childNodes.map(renderNode).join('')
}

export function plainTextChildren(node: HtmlParentNode): string {
  return node.childNodes.map(plainTextNode).join('')
}

export function demoteHeadingNodes(node: HtmlParentNode): void {
  for (const child of node.childNodes) {
    if ('tagName' in child && isHeadingTagName(child.tagName)) {
      const nextLevel = Math.min(Number(child.tagName.slice(1)) + 2, 6)
      child.tagName = `h${nextLevel}`
      child.nodeName = child.tagName
    }

    if ('childNodes' in child) demoteHeadingNodes(child)
  }
}

function renderNode(node: HtmlChildNode): string {
  if ('value' in node) return escapeText(node.value)
  if (!('tagName' in node)) return ''

  const tagName = node.tagName.toLowerCase()
  if (DANGEROUS_TAGS.has(tagName)) return ''

  const children = renderChildren(node)
  if (!ALLOWED_TAGS.has(tagName)) return children

  const attrs = renderAttributes(tagName, node.attrs)
  const open = `<${tagName}${attrs}>`
  if (HTML_FRAGMENT_VOID_TAGS.has(tagName)) return open
  return `${open}${children}</${tagName}>`
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') // Intentional HTML-escaping chain; see docs/overview/architecture/content-rendering.md.
}

function plainTextNode(node: HtmlChildNode): string {
  if ('value' in node) return node.value
  if (!('tagName' in node)) return ''

  const tagName = node.tagName.toLowerCase()
  if (DANGEROUS_TAGS.has(tagName)) return ''
  if (HTML_FRAGMENT_VOID_TAGS.has(tagName)) return ' '
  return ` ${plainTextChildren(node)} `
}

function isHeadingTagName(tagName: string): boolean {
  const level = Number(tagName.slice(1))
  return tagName.length === 2 && tagName.startsWith('h') && level >= 1 && level <= 6
}
