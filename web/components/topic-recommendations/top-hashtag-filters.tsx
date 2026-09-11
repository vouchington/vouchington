import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { TopHashtagMapping } from '@/lib/api/client/topic-recommendations'
import { normalizeHashtagQuery } from '@ts-shared/utils'

export function TopHashtagFilters({
  query,
  mapping,
  onQueryChange,
  onSearch,
}: {
  query: string
  mapping: TopHashtagMapping
  onQueryChange: (query: string) => void
  onSearch: (mapping?: TopHashtagMapping) => void
}) {
  const t = useTranslations()

  return (
    <div className='flex flex-col gap-2 sm:flex-row'>
      <Input
        value={query}
        onChange={event => onQueryChange(normalizeHashtagQuery(event.target.value))}
        onKeyDown={event => {
          if (event.key === 'Enter') onSearch()
        }}
        placeholder={t('extracted.topicRecommendations.topHashtags.searchHashtags_b0cf6180')}
        aria-label={t('extracted.topicRecommendations.topHashtags.searchHashtags_b0cf6180')}
        data-pw='top-hashtags-search'
      />
      <div
        className='flex gap-2'
        data-pw='top-hashtags-mapping'
      >
        {(['all', 'linked', 'unlinked'] as const).map(value => (
          <Button
            key={value}
            type='button'
            variant={mapping === value ? 'default' : 'outline'}
            onClick={() => onSearch(value)}
          >
            {value === 'all'
              ? t('extracted.topicRecommendations.topHashtags.all_29d0b7c7')
              : value === 'linked'
                ? t('extracted.topicRecommendations.topHashtags.linked_bf62c230')
                : t('extracted.topicRecommendations.topHashtags.unlinked_2ed77046')}
          </Button>
        ))}
      </div>
    </div>
  )
}
