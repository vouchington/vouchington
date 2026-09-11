'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
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

const STATUS_VALUES = [
  'new',
  'awaiting_response',
  'in_conversation',
  'converted',
  'archived',
  'opted_out',
] as const

const VERTICAL_VALUES = [
  'credit_cards',
  'travel',
  'cars',
  'ai',
  'technology',
  'finance',
  'lifestyle',
  'other',
] as const

export function CrmContactsFilter() {
  return (
    <Suspense fallback={null}>
      <CrmContactsFilterContent />
    </Suspense>
  )
}

function CrmContactsFilterContent() {
  const t = useTranslations()
  const { push } = useRouter()
  const searchParams = useSearchParams()
  const [q, setQ] = useState(() => searchParams.get('q') ?? '')
  const [status, setStatus] = useState(() => searchParams.get('status') ?? 'all')
  const [vertical, setVertical] = useState(() => searchParams.get('vertical') ?? 'all')

  const statusLabels: Record<(typeof STATUS_VALUES)[number], string> = {
    new: t('extracted.crm.crmContactsFilter.new_e91a2b4c'),
    awaiting_response: t('extracted.crm.crmContactsFilter.awaitingResponse_c3fa8b2e'),
    in_conversation: t('extracted.crm.crmContactsFilter.inConversation_7d2c91ae'),
    converted: t('extracted.crm.crmContactsFilter.converted_4b8f0a3d'),
    archived: t('extracted.crm.crmContactsFilter.archived_91cd4f7a'),
    opted_out: t('extracted.crm.crmContactsFilter.optedOut_0a5e2c9b'),
  }

  const verticalLabels: Record<(typeof VERTICAL_VALUES)[number], string> = {
    credit_cards: t('extracted.crm.crmContactsFilter.creditCards_b6e1af02'),
    travel: t('extracted.crm.crmContactsFilter.travel_f2a97c14'),
    cars: t('extracted.crm.crmContactsFilter.cars_3d8b6e51'),
    ai: t('extracted.crm.crmContactsFilter.ai_c94a1f7d'),
    technology: t('extracted.crm.crmContactsFilter.technology_5e2b0d8a'),
    finance: t('extracted.crm.crmContactsFilter.finance_a1c3f92e'),
    lifestyle: t('extracted.crm.crmContactsFilter.lifestyle_8f04b6d3'),
    other: t('extracted.crm.crmContactsFilter.other_2c7e9a41'),
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    if (q) params.set('q', q)
    else params.delete('q')
    if (status !== 'all') params.set('status', status)
    else params.delete('status')
    if (vertical !== 'all') params.set('vertical', vertical)
    else params.delete('vertical')
    params.delete('after')
    push(`/crm?${params.toString()}`)
  }

  return (
    <form
      onSubmit={handleSearch}
      className='flex flex-wrap gap-4'
    >
      <Input
        aria-label={t('extracted.crm.crmContactsFilter.searchContacts_f863aac2')}
        data-pw='crm-search-input'
        type='text'
        name='q'
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={t('extracted.crm.crmContactsFilter.searchNameOrEmail_f05d751d')}
        autoComplete='off'
        className='min-w-48 flex-1'
      />
      <Select
        value={status}
        onValueChange={setStatus}
      >
        <SelectTrigger
          aria-label={t('extracted.crm.crmContactsFilter.statusFilter_9bfe8b18')}
          className='w-44'
        >
          <SelectValue placeholder={t('extracted.crm.crmContactsFilter.allStatuses_05f56712')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>
            {t('extracted.crm.crmContactsFilter.allStatuses_05f56712')}
          </SelectItem>
          {STATUS_VALUES.map(s => (
            <SelectItem
              key={s}
              value={s}
            >
              {statusLabels[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={vertical}
        onValueChange={setVertical}
      >
        <SelectTrigger
          aria-label={t('extracted.crm.crmContactsFilter.verticalFilter_3d1f4d54')}
          className='w-40'
        >
          <SelectValue placeholder={t('extracted.crm.crmContactsFilter.allVerticals_ed34c677')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='all'>
            {t('extracted.crm.crmContactsFilter.allVerticals_ed34c677')}
          </SelectItem>
          {VERTICAL_VALUES.map(v => (
            <SelectItem
              key={v}
              value={v}
            >
              {verticalLabels[v]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type='submit'
        data-pw='crm-search-submit'
      >
        {t('extracted.crm.crmContactsFilter.search_49c266ba')}
      </Button>
    </form>
  )
}
