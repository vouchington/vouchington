'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FILTER_CONTROL_HEIGHT } from './filter-control-height'

export interface LinkSelectDropdownItem {
  label: string
  href: string
  active?: boolean
}

export function LinkSelectDropdown({
  label,
  items,
  ariaLabel,
  dataPw = 'feed-sub-filter-trigger',
}: {
  label: string
  items: LinkSelectDropdownItem[]
  ariaLabel: string
  dataPw?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='outline'
          size='touchSm'
          aria-label={ariaLabel}
          className={cn('w-auto whitespace-nowrap', FILTER_CONTROL_HEIGHT)}
          data-pw={dataPw}
        >
          {label}
          <ChevronDown className='ml-1 h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        className='w-auto min-w-0'
      >
        {items.map(item => (
          <DropdownMenuItem
            key={item.href}
            asChild
          >
            <Link
              href={item.href}
              prefetch={false}
              aria-current={item.active ? 'page' : undefined}
              className={cn(item.active && 'font-semibold')}
            >
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
