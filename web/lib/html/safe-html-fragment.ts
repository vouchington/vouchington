import { parseFragment } from 'parse5'
import {
  demoteHeadingNodes,
  plainTextChildren,
  renderChildren,
} from './safe-html-fragment-renderer'

declare const SAFE_HTML_FRAGMENT: unique symbol

export type SafeHtmlFragment = string & { readonly [SAFE_HTML_FRAGMENT]: true }
export const HTML_FRAGMENT_VOID_TAGS = new Set(['br', 'hr', 'img'])

export function sanitizeHtmlFragment(html: string): SafeHtmlFragment {
  const fragment = parseFragment(html)
  return renderChildren(fragment) as SafeHtmlFragment
}

export function sanitizePreviewHtmlFragment(
  html: string | null | undefined,
): SafeHtmlFragment | null | undefined {
  if (html === null || html === undefined) return html
  if (!html) return '' as SafeHtmlFragment

  const fragment = parseFragment(html)
  demoteHeadingNodes(fragment)
  return renderChildren(fragment) as SafeHtmlFragment
}

export function htmlFragmentToPlainText(html: string): string {
  const fragment = parseFragment(html)
  const text = plainTextChildren(fragment)
  return text.replace(/[\s\u00A0]+/g, ' ').trim()
}
