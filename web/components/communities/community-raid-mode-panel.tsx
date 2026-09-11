'use client'

import { useMemo, useReducer, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  activateCommunityRestrictions,
  liftCommunityRestriction,
} from '@/lib/api/client/community-restrictions'
import onError, { onSuccess } from '@/lib/on-error'
import type {
  Community,
  CommunityRestrictionsResponseBody,
  CommunityRestrictionType,
} from '@/types/api-responses'
import { CommunityRaidModeActiveList } from './community-raid-mode-active-list'
import { CommunityRaidModeForm } from './community-raid-mode-form'
import {
  getActiveRestrictions,
  getExpiresAt,
  initialRaidModeState,
  raidModeReducer,
  type DurationValue,
} from './community-raid-mode-state'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  community: Pick<Community, 'slug'>
  initialData: CommunityRestrictionsResponseBody
}

export function CommunityRaidModePanel({ community, initialData }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [state, dispatch] = useReducer(raidModeReducer, initialRaidModeState)
  const [isNavigating, startNavigation] = useTransition()
  const activeRestrictions = useMemo(() => getActiveRestrictions(initialData), [initialData])
  const raidModeSuggestion = initialData.raid_mode_suggestion
  const isBusy = state.isSaving || isNavigating

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isBusy || state.selectedTypes.size === 0) return

    dispatch({ type: 'saving' })
    try {
      await activateCommunityRestrictions(community.slug, {
        restrictionTypes: [...state.selectedTypes],
        expiresAt: getExpiresAt(state.duration),
        reason: state.reason.trim() || undefined,
      })
      onSuccess(t('extracted.communities.communityRaidModePanel.raidModeActivated_acf3cc24'))
      startNavigation(() => router.refresh())
      dispatch({ type: 'resetBusy' })
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.communities.communityRaidModePanel.couldNotActivateRaidMode_7d70c331',
        ),
        tags: { form: 'community-raid-mode' },
      })
      dispatch({ type: 'resetBusy' })
    }
  }

  async function handleLift(restrictionId: string) {
    if (isBusy || state.liftingId) return
    dispatch({ type: 'lifting', liftingId: restrictionId })
    try {
      await liftCommunityRestriction(community.slug, restrictionId)
      onSuccess(t('extracted.communities.communityRaidModePanel.restrictionLifted_032247f0'))
      startNavigation(() => router.refresh())
      dispatch({ type: 'resetBusy' })
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.communities.communityRaidModePanel.couldNotLiftRestriction_2c663aa1',
        ),
        tags: { form: 'community-raid-mode' },
      })
      dispatch({ type: 'resetBusy' })
    }
  }

  async function handleLiftAll() {
    if (isBusy || state.liftingId || activeRestrictions.length === 0) return
    dispatch({ type: 'lifting', liftingId: 'all' })
    const results = await Promise.allSettled(
      activeRestrictions.map(restriction =>
        liftCommunityRestriction(community.slug, restriction.id),
      ),
    )
    const failures = results.filter(result => result.status === 'rejected')
    if (failures.length === 0) {
      onSuccess(t('extracted.communities.communityRaidModePanel.raidModeLifted_8fa9a7d4'))
    } else {
      onError(new Error('Some Raid Mode restrictions could not be lifted'), {
        fallback: t(
          'extracted.communities.communityRaidModePanel.couldNotLiftAllRestrictions_56f4eadf',
        ),
        tags: { form: 'community-raid-mode' },
      })
    }
    startNavigation(() => router.refresh())
    dispatch({ type: 'resetBusy' })
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle data-pw='community-raid-mode-heading'>
              {t('extracted.communities.communityRaidModePanel.raidMode_37beccc4')}
            </CardTitle>
            <CardDescription>
              {t(
                'extracted.communities.communityRaidModePanel.temporaryCommunityRestrictions_004ab9fd',
              )}
            </CardDescription>
          </div>
          {activeRestrictions.length > 0 && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              loading={state.liftingId === 'all'}
              disabled={isBusy}
              onClick={handleLiftAll}
              data-pw='community-raid-mode-lift-all'
            >
              <ShieldOff className='mr-2 h-4 w-4' />
              {t('extracted.communities.communityRaidModePanel.liftAll_36bc3c05')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {raidModeSuggestion && raidModeSuggestion.velocity_spike && (
          <Alert>
            <ShieldAlert className='h-4 w-4' />
            <AlertTitle>
              {t('extracted.communities.communityRaidModePanel.voteSpikeDetected_21391702')}
            </AlertTitle>
            <AlertDescription>
              {raidModeSuggestion.flag_count} unresolved velocity spike
              {raidModeSuggestion.flag_count === 1 ? '' : 's'} affect community posts.
            </AlertDescription>
          </Alert>
        )}

        <CommunityRaidModeActiveList
          restrictions={activeRestrictions}
          liftingId={state.liftingId}
          isBusy={isBusy}
          onLift={handleLift}
        />
        <CommunityRaidModeForm
          state={state}
          isBusy={isBusy}
          onSubmit={handleSubmit}
          onToggle={(restrictionType: CommunityRestrictionType, checked: boolean) =>
            dispatch({ type: 'toggleRestriction', restrictionType, checked })
          }
          onDurationChange={(duration: DurationValue) =>
            dispatch({ type: 'setDuration', duration })
          }
          onReasonChange={(reason: string) => dispatch({ type: 'setReason', reason })}
        />
      </CardContent>
    </Card>
  )
}
