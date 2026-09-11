'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import onError, { onSuccess } from '@/lib/on-error'
import {
  setMyModeratorVacation,
  clearMyModeratorVacation,
  setSuppressCommunityDigestsWhileOnVacation,
} from '@/lib/api/client/moderator-vacation'
import type { CommunityMemberVacation } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  ModeratorVacationDigestToggle,
  ModeratorVacationDurationControl,
} from './community-moderator-vacation-controls'
import {
  initialModeratorVacationDuration,
  moderatorVacationDurationToEndsAt,
} from './moderator-vacation-duration'
import { moderatorVacationDurationOptions } from './community-moderator-vacation-options'

interface Props {
  communitySlug: string
  initialVacation: CommunityMemberVacation | null
  initialSuppressCommunityDigestsWhileOnVacation?: boolean
}

export function CommunityModeratorVacationPanel({
  communitySlug,
  initialVacation,
  initialSuppressCommunityDigestsWhileOnVacation = false,
}: Props) {
  const t = useTranslations()
  const DURATION_OPTIONS = moderatorVacationDurationOptions(t)
  const [active, setActive] = useState(initialVacation !== null)
  const [duration, setDuration] = useState(() =>
    initialModeratorVacationDuration(
      initialVacation,
      DURATION_OPTIONS.map(option => option.value),
    ),
  )
  const [isPending, startTransition] = useTransition()
  const [suppressDigests, setSuppressDigests] = useState(
    initialSuppressCommunityDigestsWhileOnVacation,
  )

  function handleSuppressDigestsToggle(enabled: boolean) {
    if (isPending) return
    const previous = suppressDigests
    setSuppressDigests(enabled)
    startTransition(async () => {
      try {
        await setSuppressCommunityDigestsWhileOnVacation(communitySlug, enabled)
        onSuccess(
          enabled
            ? t(
                'extracted.communities.communityModeratorVacationPanel.communityDigestsPausedWhileOnVacation_a91d1194',
              )
            : t(
                'extracted.communities.communityModeratorVacationPanel.communityDigestsResumed_be90a3ac',
              ),
        )
      } catch (error) {
        setSuppressDigests(previous)
        onError(error, {
          fallback: t(
            'extracted.communities.communityModeratorVacationPanel.failedToUpdateCommunityDigestPreference_8cd7e69b',
          ),
          tags: { panel: 'moderator-vacation' },
        })
      }
    })
  }

  function handleToggle(enabled: boolean) {
    if (isPending) return
    const prev = active
    setActive(enabled)

    startTransition(async () => {
      try {
        if (enabled) {
          await setMyModeratorVacation(communitySlug, {
            endsAt: moderatorVacationDurationToEndsAt(duration),
          })
          onSuccess(
            t('extracted.communities.communityModeratorVacationPanel.vacationModeEnabled_72deebdc'),
          )
        } else {
          await clearMyModeratorVacation(communitySlug)
          onSuccess(
            t(
              'extracted.communities.communityModeratorVacationPanel.vacationModeDisabled_5d04a754',
            ),
          )
        }
      } catch (error) {
        setActive(prev)
        onError(error, {
          fallback: t(
            'extracted.communities.communityModeratorVacationPanel.failedToUpdateVacationMode_247adec7',
          ),
          tags: { panel: 'moderator-vacation' },
        })
      }
    })
  }

  function handleDurationChange(value: string) {
    if (!active || isPending) return
    const prev = duration
    setDuration(value)

    startTransition(async () => {
      try {
        await setMyModeratorVacation(communitySlug, {
          endsAt: moderatorVacationDurationToEndsAt(value),
        })
        onSuccess(
          t(
            'extracted.communities.communityModeratorVacationPanel.vacationDurationUpdated_b2338847',
          ),
        )
      } catch (error) {
        setDuration(prev)
        onError(error, {
          fallback: t(
            'extracted.communities.communityModeratorVacationPanel.failedToUpdateVacationDuration_b2cadfd0',
          ),
          tags: { panel: 'moderator-vacation' },
        })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle data-pw='mod-vacation-heading'>
          {t('extracted.communities.communityModeratorVacationPanel.vacationMode_cff1de64')}
        </CardTitle>
        <CardDescription>
          {t(
            'extracted.communities.communityModeratorVacationPanel.whileOnVacationYouWillNot_a8957240',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-start gap-4'>
          <Switch
            id='mod-vacation'
            checked={active}
            onCheckedChange={handleToggle}
            disabled={isPending}
            data-pw='mod-vacation-toggle'
          />
          <div className='space-y-1'>
            <Label htmlFor='mod-vacation'>
              {t('extracted.communities.communityModeratorVacationPanel.onVacation_9153ee36')}
            </Label>
            <p className='text-sm text-muted-foreground'>
              {t(
                'extracted.communities.communityModeratorVacationPanel.toggleOnWhenYouNeedA_f3dda5da',
              )}
            </p>
          </div>
        </div>
        {active && (
          <ModeratorVacationDurationControl
            duration={duration}
            disabled={isPending}
            label={t('extracted.communities.communityModeratorVacationPanel.returnDate_1d7936a0')}
            options={DURATION_OPTIONS}
            onChange={handleDurationChange}
          />
        )}
        <ModeratorVacationDigestToggle
          checked={suppressDigests}
          disabled={isPending}
          label={t(
            'extracted.communities.communityModeratorVacationPanel.pauseCommunityDigestsWhileOnVacation_cac8f6d2',
          )}
          description={t(
            'extracted.communities.communityModeratorVacationPanel.whenVacationModeIsActivePause_4414101f',
          )}
          onChange={handleSuppressDigestsToggle}
        />
      </CardContent>
    </Card>
  )
}
