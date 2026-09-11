/* oxlint-disable no-mistakes/playwright-literals -- View option IDs come from caller-provided option data; ast-grep still bans inline calls in data-pw. */
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
import { useTranslations } from '@/lib/i18n/use-translations'

export interface ViewModeDropdownOption<T extends string> {
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
  const t = useTranslations()
  const active = options.find(option => option.value === value) ?? options[0]
  const ActiveIcon = active.icon === 'card' ? LayoutGrid : List

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='touchSm'
          className={cn('w-auto whitespace-nowrap', FILTER_CONTROL_HEIGHT)}
          aria-label={t('extracted.shared.viewModeDropdown.viewLabel_fa86d6b1', {
            label: active.label,
          })}
          data-pw={dataPw}
        >
          <ActiveIcon className='h-4 w-4' />
          <span className='sr-only'>{active.label}</span>
          <ChevronDown className='h-4 w-4' />
        </Button>
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
            <DropdownMenuItem
              key={option.value}
              onSelect={() => onValueChange(option.value)}
              data-pw={option.dataPw}
            >
              <Icon className='h-4 w-4' />
              <span>{option.label}</span>
              {isActive ? <Check className='ml-auto h-4 w-4' /> : null}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
