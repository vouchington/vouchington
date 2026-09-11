import {
  decodeHtmlEntities as decodePlatformHtmlEntities,
  escapeHtml,
  escapeInlineScriptJson,
  isInsideHtmlElement,
  isInsideHtmlTag,
} from '@vouchington/html-utils'

export { escapeHtml, escapeInlineScriptJson, isInsideHtmlTag }

const LEGACY_CASE_INSENSITIVE_NAMED_ENTITIES = new Set([
  'amp',
  'lt',
  'gt',
  'quot',
  'apos',
  'nbsp',
  'mdash',
  'ndash',
  'ldquo',
  'rdquo',
  'lsquo',
  'rsquo',
  'hellip',
  'trade',
  'copy',
  'reg',
  'bull',
  'middot',
  'deg',
  'pound',
  'euro',
  'cent',
  'times',
  'divide',
  'laquo',
  'raquo',
])
const legacyCaseInsensitiveNamedEntities = [...LEGACY_CASE_INSENSITIVE_NAMED_ENTITIES]

export function isInsideCode(text: string, position: number): boolean {
  return isInsideHtmlElement(text, position, ['code', 'pre'])
}

/** Decode HTML character references (numeric and common named) from a string. */
export function decodeHtmlEntities(text: string): string {
  return decodePlatformHtmlEntities(text, {
    caseInsensitiveNamedEntities: legacyCaseInsensitiveNamedEntities,
  })
}
