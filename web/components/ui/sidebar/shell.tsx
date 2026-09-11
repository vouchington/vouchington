'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { SIDEBAR_WIDTH_MOBILE, useSidebar } from './context'
import { useTranslations } from '@/lib/i18n/use-translations'

function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'offcanvas',
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
  ref?: React.Ref<HTMLDivElement>
}) {
  const t = useTranslations()
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === 'none') {
    return (
      <div
        className={cn(
          'flex h-full w-[var(--sidebar-width)] flex-col bg-sidebar text-sidebar-foreground',
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet
        open={openMobile}
        onOpenChange={setOpenMobile}
        {...props}
      >
        <SheetContent
          data-sidebar='sidebar'
          data-mobile='true'
          className='w-[var(--sidebar-width)] bg-sidebar p-0 text-sidebar-foreground md:hidden [&>button]:hidden'
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className='sr-only'>
            <SheetTitle>{t('extracted.sidebar.shell.sidebar_f7efa7bc')}</SheetTitle>
            <SheetDescription>
              {t('extracted.sidebar.shell.displaysTheMobileSidebar_2a174a65')}
            </SheetDescription>
          </SheetHeader>
          <div className='flex h-full w-full flex-col'>{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  const dataCollapsible = state === 'collapsed' ? collapsible : ''

  return (
    <div
      ref={ref}
      className={cn(
        'group peer sticky top-0 hidden h-svh shrink-0 overflow-hidden text-sidebar-foreground transition-[width] duration-300 ease-in-out md:block',
        dataCollapsible === 'offcanvas' && 'w-0',
        dataCollapsible === 'icon' &&
          (variant === 'floating' || variant === 'inset'
            ? 'w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]'
            : 'w-[var(--sidebar-width-icon)]'),
        !dataCollapsible && 'w-[var(--sidebar-width)]',
      )}
      data-pw='sidebar-peer'
      data-state={state}
      data-collapsible={dataCollapsible}
      data-variant={variant}
      data-side={side}
    >
      <div
        className={cn(
          'flex h-svh min-h-full w-[var(--sidebar-width)] translate-x-0 flex-col transition-[width,translate] duration-300 ease-in-out md:flex',
          'group-data-[collapsible=offcanvas]:group-data-[side=left]:-translate-x-full group-data-[collapsible=offcanvas]:group-data-[side=right]:translate-x-full',
          // Adjust the padding for floating and inset variants.
          variant === 'floating' || variant === 'inset'
            ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]'
            : 'group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)] group-data-[side=left]:border-r group-data-[side=right]:border-l',
          className,
        )}
        {...props}
      >
        <div
          data-sidebar='sidebar'
          className='flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow'
        >
          {children}
        </div>
      </div>
    </div>
  )
}
Sidebar.displayName = 'Sidebar'

export { Sidebar }
