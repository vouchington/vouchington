import { createElement, Fragment, type ReactNode } from 'react'
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import {
  HTML_FRAGMENT_VOID_TAGS,
  sanitizePreviewHtmlFragment as demotePreviewHeadings,
  type SafeHtmlFragment,
} from '@/lib/html/safe-html-fragment'

type HtmlAttribute = DefaultTreeAdapterMap['element']['attrs'][number]
type HtmlChildNode = DefaultTreeAdapterMap['childNode']

export function renderHtmlFragment(html: SafeHtmlFragment): ReactNode {
  const fragment = parseFragment(html)
  return createElement(
    Fragment,
    null,
    fragment.childNodes.map((child, index) => renderHtmlNode(child, index)),
  )
}

export { demotePreviewHeadings }

function renderHtmlNode(node: HtmlChildNode, key: number): ReactNode {
  if ('value' in node) return createElement(Fragment, { key }, node.value)
  if (!('tagName' in node)) return null

  const props = { key, ...htmlAttributesToReactProps(node.attrs) }
  if (HTML_FRAGMENT_VOID_TAGS.has(node.tagName)) {
    return createElement(node.tagName, props)
  }

  return createElement(
    node.tagName,
    props,
    node.childNodes.map((child, index) => renderHtmlNode(child, index)),
  )
}

function htmlAttributesToReactProps(attrs: HtmlAttribute[]): Record<string, string> {
  const props: Record<string, string> = {}

  for (const attr of attrs) {
    const name = reactAttributeName(attr.name)
    if (!name) continue
    props[name] = attr.value
  }

  return props
}

function reactAttributeName(name: string): string | null {
  if (name === 'class') return 'className'
  if (name === 'for') return 'htmlFor'
  if (name === 'style' || /^on/i.test(name)) return null
  return name
}
