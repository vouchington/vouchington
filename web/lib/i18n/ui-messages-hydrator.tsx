'use client'

import type { ReactNode } from 'react'
import type { EnCatalog } from '@ts-shared/ui-messages'
import { mergeMessages } from './use-translations'

/**
 * Merges a server-fetched catalog into the client cache during render so client
 * navigations pick up the new route's selectors before `useTranslations()` runs.
 */
export function UiMessagesHydrator({
  locale,
  catalog,
  children,
}: {
  locale: string
  catalog: EnCatalog
  children: ReactNode
}) {
  mergeMessages(locale, catalog)
  return children
}
