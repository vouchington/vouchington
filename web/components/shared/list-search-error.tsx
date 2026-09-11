import type { getTranslations } from '@/lib/i18n/get-translations'
import { EmptyState } from './empty-state'

interface ListSearchErrorProps {
  t: Awaited<ReturnType<typeof getTranslations>>
  message: string
}

export function ListSearchError({ t, message }: ListSearchErrorProps) {
  return (
    <EmptyState
      icon='search'
      title={t('extracted.shared.listSearchError.searchFailed_01ee45e5')}
      description={message}
    />
  )
}
