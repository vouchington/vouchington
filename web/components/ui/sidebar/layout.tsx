'use client'

import * as React from 'react'
import { PanelLeft } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useSidebar } from './context'
import { useTranslations } from '@/lib/i18n/use-translations'

function SidebarTrigger({
  className,
  onClick,
  ref,
  ...props
}: React.ComponentProps<typeof Button> & {
  ref?: React.Ref<React.ElementRef<typeof Button>>
}) {
  const t = useTranslations()
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      ref={ref}
      data-sidebar='trigger'
      data-pw='sidebar-trigger'
      variant='ghost'
      size='icon'
      className={cn('h-7 w-7', className)}
      onClick={event => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeft />
      <span className='sr-only'>{t('extracted.sidebar.layout.toggleSidebar_1d4c17db')}</span>
    </Button>
  )
}
SidebarTrigger.displayName = 'SidebarTrigger'

function SidebarInset({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative z-10 flex min-w-0 flex-1 flex-col bg-background',
        'md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow',
        'transition-[margin] duration-300 ease-in-out',
        className,
      )}
      {...props}
    />
  )
}
SidebarInset.displayName = 'SidebarInset'

function SidebarHeader({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-sidebar='header'
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  )
}
SidebarHeader.displayName = 'SidebarHeader'

function SidebarContent({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-sidebar='content'
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto group-data-[collapsible=icon]:overflow-hidden',
        className,
      )}
      {...props}
    />
  )
}
SidebarContent.displayName = 'SidebarContent'

export { SidebarContent, SidebarHeader, SidebarInset, SidebarTrigger }
