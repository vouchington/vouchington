'use client'

import { useState, useSyncExternalStore } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createCommunityPathname } from '@/lib/links/entity-href'
import { getPreference, setPreference } from '@/lib/preferences/storage'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  communitySlug: string
  hasRules: boolean
  automodConfigured: boolean
}

function prefKey(slug: string) {
  return `community-mod-onboarding:${slug}`
}

function subscribeToStaticSnapshot() {
  return () => {}
}

export function CommunityOnboardingChecklist({
  communitySlug,
  hasRules,
  automodConfigured,
}: Props) {
  const t = useTranslations()
  const storedState = useSyncExternalStore(
    subscribeToStaticSnapshot,
    () => getPreference(prefKey(communitySlug)) ?? '',
    () => 'dismissed', // SSR: hide to avoid flash
  )

  const [localDismissed, setLocalDismissed] = useState(false)
  // Local flag for immediate UI update when the user clicks "Mark as reviewed"
  // before storedState can reflect the write (subscribe is a static no-op).
  // Derive from storedState rather than seeding into useState to avoid SSR
  // hydration mismatch: the SSR snapshot is always 'dismissed', which would
  // seed orientationAcked=true for every new user.
  const [localOrientationAcked, setLocalOrientationAcked] = useState(false)
  const orientationAcked =
    localOrientationAcked || storedState.includes('orientation') || storedState === 'dismissed'

  const isDismissed = localDismissed || storedState === 'dismissed'
  const allDone = hasRules && automodConfigured && orientationAcked

  if (isDismissed || allDone) return null

  function handleDismiss() {
    setPreference(prefKey(communitySlug), 'dismissed')
    setLocalDismissed(true)
  }

  function handleOrientationAck() {
    const next = storedState.includes('orientation') ? storedState : `${storedState}|orientation`
    setPreference(prefKey(communitySlug), next.replace(/^\|/, ''))
    setLocalOrientationAcked(true)
  }

  return (
    <Card data-pw='community-onboarding-checklist'>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle>
              {t(
                'extracted.communities.communityOnboardingChecklist.getYourCommunityStarted_2017c39a',
              )}
            </CardTitle>
            <CardDescription>
              {t(
                'extracted.communities.communityOnboardingChecklist.aFewQuickStepsAndYou_8cfe329c',
              )}
            </CardDescription>
          </div>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={handleDismiss}
            data-pw='community-onboarding-dismiss'
          >
            {t('extracted.communities.communityOnboardingChecklist.dismiss_48845bff')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className='space-y-3'>
          <ChecklistItem
            done={hasRules}
            href={createCommunityPathname(communitySlug, '/settings')}
            label='Set up community rules'
            description='Set the tone — let members know what makes your community worth joining.'
            dataPw='onboarding-item-rules'
          />
          <ChecklistItem
            done={automodConfigured}
            href={createCommunityPathname(communitySlug, '/settings/moderation')}
            label='Configure automod'
            description='Let the queue work for you — automod handles the routine stuff.'
            dataPw='onboarding-item-automod'
          />
          <ChecklistItem
            done={orientationAcked}
            onAck={handleOrientationAck}
            label='Review queue orientation'
            description='Take a quick look at the moderation queue so nothing catches you off guard.'
            dataPw='onboarding-item-orientation'
          />
        </ul>
      </CardContent>
    </Card>
  )
}

interface ChecklistItemProps {
  done: boolean
  label: string
  description: string
  dataPw: string
  href?: string
  onAck?: () => void
}

function ChecklistItem({ done, label, description, dataPw, href, onAck }: ChecklistItemProps) {
  const t = useTranslations()
  return (
    <li
      className='flex items-start gap-3'
      // oxlint-disable-next-line no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- controlled sub-component, call sites all use literals
      data-pw={dataPw}
    >
      {done ? (
        <CheckCircle2
          className='mt-0.5 h-5 w-5 shrink-0 text-green-500'
          aria-hidden
        />
      ) : (
        <Circle
          className='mt-0.5 h-5 w-5 shrink-0 text-muted-foreground'
          aria-hidden
        />
      )}
      <div className='flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className={`font-medium${done ? ' line-through text-muted-foreground' : ''}`}>
            {label}
          </span>
          {!done && href && (
            <a
              href={href}
              className='text-xs text-primary underline-offset-2 hover:underline'
            >
              {t('extracted.communities.communityOnboardingChecklist.go_1a3aa4c6')}
            </a>
          )}
          {!done && onAck && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='h-6 px-2 text-xs'
              onClick={onAck}
              // oxlint-disable-next-line no-mistakes/playwright-literals -- template from caller's literal dataPw
              data-pw={`${dataPw}-ack`}
            >
              {t('extracted.communities.communityOnboardingChecklist.markAsReviewed_bd433677')}
            </Button>
          )}
        </div>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
    </li>
  )
}
