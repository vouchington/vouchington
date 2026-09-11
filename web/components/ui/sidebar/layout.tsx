'use client'

import * as React from 'react'
import { PanelLeft } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
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

function SidebarRail({
  className,
  ref,
  ...props
}: React.ComponentProps<'button'> & { ref?: React.Ref<HTMLButtonElement> }) {
  const t = useTranslations()
  const { toggleSidebar } = useSidebar()

  return (
    <button
      type='button'
      ref={ref}
      data-sidebar='rail'
      aria-label={t('extracted.sidebar.layout.toggleSidebar_1d4c17db')}
      tabIndex={-1}
      onClick={toggleSidebar}
      className={cn(
        'absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex',
        '[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize',
        '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
        'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar',
        '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
        '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
        className,
      )}
      {...props}
    />
  )
}
SidebarRail.displayName = 'SidebarRail'

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

function SidebarInput({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof Input> & {
  ref?: React.Ref<React.ElementRef<typeof Input>>
}) {
  return (
    <Input
      ref={ref}
      data-sidebar='input'
      className={cn(
        'h-8 w-full bg-background shadow-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        className,
      )}
      {...props}
    />
  )
}
SidebarInput.displayName = 'SidebarInput'

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

function SidebarFooter({
  className,
  ref,
  ...props
}: React.ComponentProps<'div'> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-sidebar='footer'
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  )
}
SidebarFooter.displayName = 'SidebarFooter'

function SidebarSeparator({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof Separator> & {
  ref?: React.Ref<React.ElementRef<typeof Separator>>
}) {
  return (
    <Separator
      ref={ref}
      data-sidebar='separator'
      className={cn('mx-2 w-auto bg-sidebar-border', className)}
      {...props}
    />
  )
}
SidebarSeparator.displayName = 'SidebarSeparator'

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

export {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
}
