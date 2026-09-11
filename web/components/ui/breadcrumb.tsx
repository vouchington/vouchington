/* oxlint-disable no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- Breadcrumb IDs are derived from caller-provided breadcrumb items; ast-grep still bans inline calls in data-pw. */
'use client'

import * as React from 'react'
import Link from 'next/link'
import { Slot } from '@radix-ui/react-slot'
import { ChevronRight, MoreHorizontal } from 'lucide-react'

import { cn } from '@/lib/utils'
import { resolveBreadcrumbName, type BreadcrumbNavItem } from '@/lib/seo/structured-data'
import { useTranslations } from '@/lib/i18n/use-translations'

function Breadcrumb({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<'nav'> & {
  separator?: React.ReactNode
  ref?: React.Ref<HTMLElement>
}) {
  const t = useTranslations()

  return (
    <nav
      ref={ref}
      aria-label={t('extracted.ui.breadcrumb.breadcrumb_d6dc6b5e')}
      data-pw='breadcrumb-nav'
      {...props}
    />
  )
}
Breadcrumb.displayName = 'Breadcrumb'

function BreadcrumbList({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<'ol'> & { ref?: React.Ref<HTMLOListElement> }) {
  return (
    <ol
      ref={ref}
      className={cn(
        'flex flex-nowrap items-center gap-1.5 min-w-0 text-sm text-muted-foreground sm:gap-2.5',
        className,
      )}
      {...props}
    />
  )
}
BreadcrumbList.displayName = 'BreadcrumbList'

function BreadcrumbItem({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<'li'> & { ref?: React.Ref<HTMLLIElement> }) {
  return (
    <li
      ref={ref}
      className={cn('inline-flex items-center gap-1.5 min-w-0', className)}
      {...props}
    />
  )
}
BreadcrumbItem.displayName = 'BreadcrumbItem'

function BreadcrumbLink({
  asChild,
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<'a'> & {
  asChild?: boolean
  ref?: React.Ref<HTMLAnchorElement>
}) {
  const Comp = asChild ? Slot : 'a'

  return (
    <Comp
      ref={ref}
      className={cn(
        'inline-flex min-h-7 items-center whitespace-nowrap transition-colors hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}
BreadcrumbLink.displayName = 'BreadcrumbLink'

function BreadcrumbPage({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<'span'> & { ref?: React.Ref<HTMLSpanElement> }) {
  return (
    <span
      ref={ref}
      aria-current='page'
      className={cn('block min-w-0 truncate font-normal text-foreground', className)}
      {...props}
    />
  )
}
BreadcrumbPage.displayName = 'BreadcrumbPage'

const BreadcrumbSeparator = ({ children, className, ...props }: React.ComponentProps<'li'>) => (
  <li
    role='presentation'
    aria-hidden='true'
    className={cn('shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5', className)}
    {...props}
  >
    {children ?? <ChevronRight />}
  </li>
)
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator'

const BreadcrumbEllipsis = ({ className, ...props }: React.ComponentProps<'span'>) => {
  const t = useTranslations()

  return (
    <span
      role='presentation'
      aria-hidden='true'
      className={cn('flex h-9 w-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontal className='h-4 w-4' />
      <span className='sr-only'>{t('extracted.ui.breadcrumb.more_d47d7cb0')}</span>
    </span>
  )
}
BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis'

interface BreadcrumbsProps {
  items: BreadcrumbNavItem[]
}

function breadcrumbPathSlug(path: string): string {
  const slug = path
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'home'
}

function Breadcrumbs({ items }: BreadcrumbsProps) {
  const t = useTranslations()

  if (items.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const pathSlug = breadcrumbPathSlug(item.path)
          const currentTestId = `breadcrumb-current-${pathSlug}`
          const linkTestId = `breadcrumb-link-${pathSlug}`
          const name = resolveBreadcrumbName(item, t)

          return (
            <React.Fragment key={`${name}:${item.path}`}>
              <BreadcrumbItem className={isLast ? 'shrink' : 'shrink-0'}>
                {isLast ? (
                  <BreadcrumbPage data-pw={currentTestId}>{name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link
                      href={item.path}
                      data-pw={linkTestId}
                      prefetch={false}
                    >
                      {name}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
  Breadcrumbs,
}
