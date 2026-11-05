'use client'

import { ChevronDown, Check, LayoutGrid, List } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FILTER_CONTROL_HEIGHT } from './filter-control-height'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DataPw } from '@/components/shared/data-pw'

interface ViewModeDropdownOption<T extends string> {
  label: string
  value: T
  icon: 'card' | 'compact'
  dataPw: string
}

interface ViewModeDropdownProps<T extends string> {
  value: T
  options: [ViewModeDropdownOption<T>, ...ViewModeDropdownOption<T>[]]
  onValueChange: (value: T) => void
  dataPw?: string
}

export function ViewModeDropdown<T extends string>({
  value,
  options,
  onValueChange,
  dataPw = 'post-view-toggle-trigger',
}: ViewModeDropdownProps<T>) {
  const didHydrate = useDidHydrate()
  const t = useTranslations()
  const active = options.find(option => option.value === value) ?? options[0]
  const ActiveIcon = active.icon === 'card' ? LayoutGrid : List

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        asChild
        disabled={!didHydrate}
      >
        <DataPw
          dataPw={dataPw}
          as={Button}
          type='button'
          variant='outline'
          size='touchSm'
          className={cn('w-auto whitespace-nowrap', FILTER_CONTROL_HEIGHT)}
          aria-label={t('extracted.shared.viewModeDropdown.viewLabel_fa86d6b1', {
            label: active.label,
          })}
        >
          <ActiveIcon className='h-4 w-4' />
          <span className='sr-only'>{active.label}</span>
          <ChevronDown className='h-4 w-4' />
        </DataPw>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-auto min-w-0'
      >
        <DropdownMenuLabel>
          {t('extracted.shared.viewModeDropdown.view_dcc839a4')}
        </DropdownMenuLabel>
        {options.map(option => {
          const Icon = option.icon === 'card' ? LayoutGrid : List
          const isActive = option.value === value

          return (
            <DataPw
              key={option.value}
              dataPw={option.dataPw}
              as={DropdownMenuItem}
              onSelect={() => onValueChange(option.value)}
            >
              <Icon className='h-4 w-4' />
              <span>{option.label}</span>
              {isActive ? <Check className='ml-auto h-4 w-4' /> : null}
            </DataPw>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
