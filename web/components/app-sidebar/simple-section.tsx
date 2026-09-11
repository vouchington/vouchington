/* oxlint-disable no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- Sidebar IDs derive from caller-provided section/item data; ast-grep still bans inline calls in data-pw. */
'use client'

import type { ComponentType } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export interface SidebarSectionItem {
  href: string
  icon: ComponentType
  label: string
  dataPw: string
  active?: boolean
}

interface SimpleSidebarSectionProps {
  dataPw: string
  items: SidebarSectionItem[]
  label: string
}

export function SimpleSidebarSection({ dataPw, items, label }: SimpleSidebarSectionProps) {
  return (
    <Collapsible
      defaultOpen
      className='group'
    >
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger
            className='cursor-pointer'
            data-pw={dataPw}
          >
            {label}
            <ChevronDown className='ml-auto size-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90' />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => {
                const Icon = item.icon

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.active}
                    >
                      <Link
                        href={item.href}
                        data-pw={item.dataPw}
                        prefetch={false}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
