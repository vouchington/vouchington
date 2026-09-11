'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ConversationSearchFormProps {
  searchType: string
  searchField: string
  onSearchTypeChange: (value: string) => void
  onSearchFieldChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
}

export function ConversationSearchForm({
  searchType,
  searchField,
  onSearchTypeChange,
  onSearchFieldChange,
  onSubmit,
}: ConversationSearchFormProps) {
  const t = useTranslations()
  return (
    <form
      onSubmit={onSubmit}
      className='flex gap-2'
    >
      <Select
        value={searchType}
        onValueChange={onSearchTypeChange}
      >
        <SelectTrigger
          className='w-auto'
          aria-label={t('extracted.agents.conversationList.conversationSearchType_5abe0129')}
        >
          <SelectValue placeholder={t('extracted.agents.conversationList.username_e3b89e9d')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='username'>
            {t('extracted.agents.conversationList.username_e3b89e9d')}
          </SelectItem>
          <SelectItem value='user_id'>
            {t('extracted.agents.conversationList.userId_7967e089')}
          </SelectItem>
          <SelectItem value='post_id'>
            {t('extracted.agents.conversationList.postId_c1ddd2e1')}
          </SelectItem>
          <SelectItem value='post_slug'>
            {t('extracted.agents.conversationList.postSlug_b6d21032')}
          </SelectItem>
          <SelectItem value='rss_feed_item_id'>
            {t('extracted.agents.conversationList.sourceItemId_6b96e076')}
          </SelectItem>
        </SelectContent>
      </Select>
      <Input
        type='search'
        name='conversation-search'
        value={searchField}
        onChange={e => onSearchFieldChange(e.target.value)}
        placeholder={t('extracted.agents.conversationList.searchConversations_e90dd017')}
        className='flex-1'
        aria-label={t('extracted.agents.conversationList.searchConversations_8abdf3b2')}
        autoComplete='off'
      />
      <Button type='submit'>{t('extracted.agents.conversationList.search_49c266ba')}</Button>
    </form>
  )
}
