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

export interface TitleRouteDropdownItem {
  label: string
  href: string
  active?: boolean
}

interface TitleRouteDropdownProps {
  label: string
  items: TitleRouteDropdownItem[]
  dataPw?: string
  className?: string
}

export function TitleRouteDropdown({
  label,
  items,
  dataPw = 'feed-title-dropdown-trigger',
  className,
}: TitleRouteDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          className={cn('h-auto px-0 py-0 text-2xl font-semibold hover:bg-transparent', className)}
          data-pw={dataPw}
        >
          <span>{label}</span>
          <ChevronDown className='ml-1 h-5 w-5' />
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
