/* oxlint-disable no-mistakes/playwright-literals -- Intent switcher item IDs come from intent config data; ast-grep still bans inline calls in data-pw. */
'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth/context'
import { NAV_INTENTS, findIntentLandingHref } from '@/lib/navigation/intents'
import { useResolvedIntent } from '@/lib/navigation/intents/nav-intent-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags'

export function IntentSwitcher({ variant }: { variant: 'navbar' | 'sidebar' }) {
  const t = useTranslations()
  const pathname = usePathname()
  const { currentUser, isAuthenticated } = useAuth()
  const userRoles: readonly string[] = currentUser?.roles ?? []
  const featureFlags = useFeatureFlags()

  const visibleIntents = NAV_INTENTS.filter(intent => {
    if (intent.featureFlag && featureFlags[intent.featureFlag] !== true) return false
    if (intent.requiresAuth && !isAuthenticated) return false
    if (intent.roles && intent.roles.length > 0) {
      return intent.roles.some(role => userRoles.includes(role))
    }
    return true
  })

  // Resolve active intent only within the user's visible (authorized) intents.
  // useResolvedIntent() may return null for chrome-only routes — keep null
  // so those pages don't falsely highlight an unrelated intent in the trigger.
  const activeIntentId = useResolvedIntent(pathname)
  const activeIntent =
    activeIntentId != null ? (visibleIntents.find(i => i.id === activeIntentId) ?? null) : null

  const ActiveIcon = activeIntent?.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='touchSm'
          className={cn(
            'max-md:min-h-11',
            variant === 'navbar' && 'hidden sm:inline-flex gap-1.5 px-2 sm:px-3',
            variant === 'sidebar' && 'w-full justify-between gap-1.5',
          )}
          aria-label={
            variant === 'navbar'
              ? activeIntent?.label
                ? t('extracted.navbar.intentSwitcher.navigateIntentsLabel_920e75d7', {
                    label: t(activeIntent.label),
                  })
                : t('extracted.navbar.intentSwitcher.navigateIntents_496c1f7e')
              : t('extracted.navbar.intentSwitcher.navigateIntents_496c1f7e')
          }
          data-pw='intent-switcher-trigger'
        >
          <span className='flex items-center gap-1.5'>
            {ActiveIcon && <ActiveIcon className='size-4 shrink-0' />}
            <span className={cn(variant === 'navbar' && 'hidden sm:inline')}>
              {activeIntent?.label
                ? t(activeIntent.label)
                : t('extracted.navbar.intentSwitcher.menu_99af6606')}
            </span>
          </span>
          <ChevronDown className='size-4 shrink-0' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        {visibleIntents.map(intent => {
          const Icon = intent.icon
          const isActive = activeIntent != null && intent.id === activeIntent.id
          // Each dropdown item must be a real anchor so middle-click, cmd-click,
          // right-click → copy link, and keyboard navigation all work correctly.
          const landingHref = findIntentLandingHref(intent, isAuthenticated, userRoles)
          if (!landingHref) return null // hide rather than show a non-navigable entry
          return (
            <DropdownMenuItem
              key={intent.id}
              asChild
              aria-current={isActive ? 'true' : undefined}
              className={cn(isActive && 'font-semibold')}
            >
              <Link
                href={landingHref}
                prefetch={false}
                data-pw={`intent-switcher-item-${intent.id}`}
              >
                <Icon className='size-4 shrink-0' />
                {t(intent.label)}
              </Link>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
