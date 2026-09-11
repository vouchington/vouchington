import { defaultTranslator } from '@ts-shared/ui-messages/default-translator'
import type { MessageKey, Translator } from '@ts-shared/ui-messages'
import { buildAbsoluteUrl } from './constants'

/**
 * `nameKey` carries a translatable label resolved at render/schema-generation time; `name`
 * carries pre-translated or user-generated content (e.g. a community's display name) that
 * must never be passed through `t()`. Kept as a discriminated union (not an optional field)
 * so a consumer reading `.name` unconditionally is a compile error.
 */
export type BreadcrumbNavItem =
  | { name: string; path: string }
  | { nameKey: MessageKey; path: string }

export function resolveBreadcrumbName(item: BreadcrumbNavItem, t: Translator): string {
  return 'nameKey' in item ? t(item.nameKey) : item.name
}

export function createBreadcrumbSchema(
  items: BreadcrumbNavItem[],
  t: Translator = defaultTranslator,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: resolveBreadcrumbName(item, t),
      item: buildAbsoluteUrl(item.path),
    })),
  }
}
