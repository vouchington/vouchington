'use client'

import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { searchUsersExcluding } from '@/components/shared/search-users-excluding'
import type { PublicUser } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

const NO_EXCLUSIONS: ReadonlySet<string> = new Set()

interface Props {
  value: string | null
  label: string
  onChange: (id: string, username: string) => void
  placeholder?: string
  id?: string
  disabled?: boolean
  /** Clear the stored id when the user edits the search text without re-selecting a result. */
  clearOnTextEdit?: boolean
  dataPw?: {
    input?: string
    item?: string
  }
}

export function UserAutocomplete({
  value,
  label,
  onChange,
  placeholder,
  id,
  disabled,
  clearOnTextEdit,
  dataPw,
}: Props) {
  const t = useTranslations()
  const search = (q: string, signal: AbortSignal) =>
    searchUsersExcluding(q, NO_EXCLUSIONS, { signal })

  return (
    <EntityAutocomplete
      queryLabel={label}
      search={search}
      getKey={(user: PublicUser) => user.id}
      getItemValue={(user: PublicUser) => user.id}
      placeholder={placeholder ?? t('extracted.users.userAutocomplete.searchUsers_beb0e209')}
      ariaLabel={t('extracted.users.userAutocomplete.searchUsers_e4bb77af')}
      emptyText={t('extracted.users.userAutocomplete.noUsersFound_ce0171e5')}
      id={id}
      disabled={disabled}
      dataPw={dataPw}
      onQueryChange={
        clearOnTextEdit
          ? () => {
              if (value) onChange('', '')
            }
          : undefined
      }
      onSelect={(user: PublicUser, { setQuery }: { setQuery: (query: string) => void }) => {
        const username = user.username ?? user.id
        onChange(user.id, username)
        setQuery(username)
      }}
      renderItem={(user: PublicUser) => (
        <>
          {user.username ?? user.id}
          {user.display_account?.name && (
            <span className='text-xs text-muted-foreground'>{user.display_account.name}</span>
          )}
        </>
      )}
    />
  )
}
