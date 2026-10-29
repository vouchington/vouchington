'use client'

import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { searchUsersExcluding } from '@/components/shared/search-users-excluding'
import type { PublicUser } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getUserLabel } from '@/lib/users/user-helpers'

const NO_EXCLUSIONS: ReadonlySet<string> = new Set()

interface Props {
  value: string | null
  label: string
  onChange: (id: string, username: string) => void
  placeholder?: string
  id?: string
  disabled?: boolean
  /** Accessible name; defaults to the generic search label. Include any visible label text. */
  ariaLabel?: string
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
  ariaLabel,
  clearOnTextEdit,
  dataPw,
}: Props) {
  const t = useTranslations()
  const deletedUserLabel = t('shared.user.deletedUser')
  const search = (q: string, signal: AbortSignal) =>
    searchUsersExcluding(q, NO_EXCLUSIONS, { signal })

  return (
    <EntityAutocomplete
      queryLabel={label}
      search={search}
      getKey={(user: PublicUser) => user.id}
      getItemValue={(user: PublicUser) => user.id}
      placeholder={placeholder ?? t('extracted.users.userAutocomplete.searchUsers_beb0e209')}
      ariaLabel={ariaLabel ?? t('extracted.users.userAutocomplete.searchUsers_e4bb77af')}
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
        onChange(user.id, user.username ?? '')
        setQuery(getUserLabel(user, deletedUserLabel))
      }}
      renderItem={(user: PublicUser) => (
        <>
          {getUserLabel(user, deletedUserLabel)}
          {user.username &&
            user.display_account?.name &&
            user.display_account.name !== user.username && (
              <span className='text-xs text-muted-foreground'>@{user.username}</span>
            )}
        </>
      )}
    />
  )
}
