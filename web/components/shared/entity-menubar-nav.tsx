'use client'

import { useRef, type MouseEvent, type ReactElement } from 'react'
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from '@/components/ui/menubar'
import { cn } from '@/lib/utils'
import {
  entityMenubarDropdownItemClassName,
  entityMenubarTriggerClassName,
} from './entity-menubar-classes'
import { preserveScrollForInternalHrefClick } from '@/lib/navigation/scroll-preservation'

export interface EntityMenubarDropdownItem {
  key: string
  content: ReactElement
  active?: boolean
}

export interface EntityMenubarItem {
  key: string
  content: ReactElement
  active?: boolean
  dropdownItems?: EntityMenubarDropdownItem[]
}

interface EntityMenubarNavProps {
  items: EntityMenubarItem[]
  ariaLabel: string
  className?: string
  preserveScrollOnNavigation?: boolean
}

function preserveScrollFromClickTarget(
  event: MouseEvent<HTMLElement>,
  preserveScrollOnNavigation: boolean,
): boolean {
  if (!preserveScrollOnNavigation) return false
  const target = event.target instanceof Element ? event.target : null
  const href = target?.closest<HTMLAnchorElement>('a[href]')?.href
  return preserveScrollForInternalHrefClick(event, href)
}

export function EntityMenubarNav({
  items,
  ariaLabel,
  className,
  preserveScrollOnNavigation = false,
}: EntityMenubarNavProps) {
  const preventDropdownCloseAutoFocusRef = useRef(false)

  return (
    <Menubar
      aria-label={ariaLabel}
      className={cn(
        'h-auto min-h-9 w-full justify-start overflow-x-auto scrollbar-hide border-border/80 bg-background p-0.5 shadow-xs',
        className,
      )}
      data-pw='entity-menubar-nav'
      onClickCapture={event => preserveScrollFromClickTarget(event, preserveScrollOnNavigation)}
    >
      {items.map(item =>
        item.dropdownItems ? (
          <MenubarMenu key={item.key}>
            <MenubarTrigger
              asChild
              aria-current={item.active ? 'page' : undefined}
              className={entityMenubarTriggerClassName}
              data-active={item.active ? 'true' : 'false'}
            >
              {item.content}
            </MenubarTrigger>
            <MenubarContent
              onClickCapture={event => {
                preventDropdownCloseAutoFocusRef.current = preserveScrollFromClickTarget(
                  event,
                  preserveScrollOnNavigation,
                )
              }}
              onCloseAutoFocus={event => {
                if (!preventDropdownCloseAutoFocusRef.current) return
                preventDropdownCloseAutoFocusRef.current = false
                event.preventDefault()
              }}
            >
              {item.dropdownItems.map(dropdownItem => (
                <MenubarItem
                  key={dropdownItem.key}
                  asChild
                  className={entityMenubarDropdownItemClassName}
                  data-active={dropdownItem.active ? 'true' : 'false'}
                >
                  {dropdownItem.content}
                </MenubarItem>
              ))}
            </MenubarContent>
          </MenubarMenu>
        ) : (
          <MenubarMenu key={item.key}>
            <MenubarTrigger
              asChild
              aria-current={item.active ? 'page' : undefined}
              className={entityMenubarTriggerClassName}
              data-active={item.active ? 'true' : 'false'}
            >
              {item.content}
            </MenubarTrigger>
          </MenubarMenu>
        ),
      )}
    </Menubar>
  )
}
