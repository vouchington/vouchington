'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { searchUsersExcluding } from '@/components/shared/search-users-excluding'
import type { UserSearchResult } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  recipients: UserSearchResult[]
  onAdd: (user: UserSearchResult) => void
  onRemove: (userId: string) => void
  excludeIds?: string[]
  disabled?: boolean
}

export function RecipientPicker({ recipients, onAdd, onRemove, excludeIds, disabled }: Props) {
  const t = useTranslations()
  const selectedIds = new Set(recipients.map(r => r.id))

  async function search(query: string, signal: AbortSignal) {
    const excluded = excludeIds ? new Set([...selectedIds, ...excludeIds]) : selectedIds
    return searchUsersExcluding(query, excluded, { signal })
  }

  return (
    <div
      data-pw='recipient-picker'
      className='space-y-2'
    >
      {recipients.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {recipients.map(recipient => (
            <div
              key={recipient.id}
              data-pw='recipient-chip'
              className='flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm'
            >
              <span>{recipient.username ? `@${recipient.username}` : recipient.id}</span>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                data-pw='remove-recipient-button'
                aria-label={t('extracted.messages.recipientPicker.removeName_e6a3c4a1', {
                  name: recipient.username ?? recipient.id,
                })}
                onClick={() => onRemove(recipient.id)}
                disabled={disabled}
                className='ml-1 h-5 w-5 rounded-full p-0.5 hover:bg-secondary-foreground/10'
              >
                <X className='h-3 w-3' />
              </Button>
            </div>
          ))}
        </div>
      )}
      <EntityAutocomplete<UserSearchResult>
        search={search}
        getKey={user => user.id}
        renderItem={user => <span>{user.username ? `@${user.username}` : user.id}</span>}
        onSelect={(user, { setQuery }) => {
          onAdd(user)
          setQuery('')
        }}
        clearResultsOnSelect
        placeholder={t('extracted.messages.recipientPicker.searchUsers_02b756f1')}
        ariaLabel={t('extracted.messages.recipientPicker.searchForRecipients_21c9d075')}
        emptyText={t('extracted.messages.recipientPicker.noUsersFound_bf1e104f')}
        disabled={disabled}
        dataPw={{ input: 'recipient-picker-input', item: 'recipient-picker-item' }}
      />
    </div>
  )
}
