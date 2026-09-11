'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/shared/search-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'

export type SupportStatusFilter = 'open' | 'assigned' | 'resolved' | 'all'

export function AdminSupportThreadFilters({
  initialQ,
  initialStatus,
  isPending,
  onChange,
}: {
  initialQ: string | undefined
  initialStatus: Exclude<SupportStatusFilter, 'all'> | undefined
  isPending: boolean
  onChange: (filters: { q: string; status: SupportStatusFilter }) => void
}) {
  const t = useTranslations()
  const [q, setQ] = useState(initialQ ?? '')
  const [status, setStatus] = useState<SupportStatusFilter>(initialStatus ?? 'all')
  const queryDirtyRef = useRef(false)

  useEffect(() => {
    queueMicrotask(() => {
      if (!queryDirtyRef.current) setQ(initialQ ?? '')
      setStatus(initialStatus ?? 'all')
    })
  }, [initialQ, initialStatus])

  return (
    <form
      className='flex flex-1 flex-wrap gap-2'
      onSubmit={event => {
        event.preventDefault()
        queryDirtyRef.current = false
        onChange({ q: q.trim(), status })
      }}
    >
      <SearchInput
        aria-label={t('extracted.support.adminSupportThreadFilters.searchSupportThreads_daac5246')}
        value={q}
        onChange={event => {
          queryDirtyRef.current = true
          setQ(event.target.value)
        }}
        placeholder={t(
          'extracted.support.adminSupportThreadFilters.searchBySubjectOrMessage_667f285e',
        )}
        className='h-11 min-w-44 flex-1 sm:h-9'
      />
      <Select
        value={status}
        onValueChange={value => {
          const nextStatus = value as SupportStatusFilter
          setStatus(nextStatus)
          queryDirtyRef.current = false
          onChange({ q: q.trim(), status: nextStatus })
        }}
      >
        <SelectTrigger
          data-pw='support-threads-status-filter'
          className='h-11 w-36 sm:h-9'
          aria-label={t(
            'extracted.support.adminSupportThreadFilters.filterThreadsByStatus_e6fa1f02',
          )}
          disabled={isPending}
        >
          <SelectValue
            placeholder={t('extracted.support.adminSupportThreadFilters.allStatuses_8ee57323')}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>
            {t('extracted.support.adminSupportThreadFilters.all_a52ace42')}
          </SelectItem>
          <SelectItem value='open'>
            {t('extracted.support.adminSupportThreadFilters.open_ed077f3d')}
          </SelectItem>
          <SelectItem value='assigned'>
            {t('extracted.support.adminSupportThreadFilters.assigned_8191888d')}
          </SelectItem>
          <SelectItem value='resolved'>
            {t('extracted.support.adminSupportThreadFilters.resolved_5be3c2c8')}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        type='submit'
        size='touchIcon'
        variant='outline'
        disabled={isPending}
        aria-label={t('extracted.support.adminSupportThreadFilters.search_49c266ba')}
      >
        <Search className='h-4 w-4' />
      </Button>
    </form>
  )
}
