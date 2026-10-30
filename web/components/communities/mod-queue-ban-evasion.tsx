'use client'

import Link from 'next/link'
import { ShieldAlert, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  confirmCommunityBanEvasion,
  dismissCommunityBanEvasion,
} from '@/lib/api/client/community-ban-evasion'
import { createUserPathname } from '@/lib/links/entity-href'
import onError from '@/lib/on-error'
import type { CommunityBanEvasionContext } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getUserLabel } from '@/lib/users/user-helpers'

interface ModQueueBanEvasionProps {
  banEvasion: CommunityBanEvasionContext
  entityId: string
  reportId: string
  disabled: boolean
  onAction: (reportId: string) => void
}

function hasBanEvasionSource(banEvasion: CommunityBanEvasionContext) {
  return Boolean(banEvasion.source_username) || Boolean(banEvasion.source_user_id)
}

function hasConfirmableBanEvasionEvidence(banEvasion: CommunityBanEvasionContext) {
  return hasBanEvasionSource(banEvasion) || typeof banEvasion.score === 'number'
}

export function ModQueueBanEvasionInfo({ banEvasion }: { banEvasion: CommunityBanEvasionContext }) {
  const t = useTranslations()
  const sourceLabel = getUserLabel(
    {
      username: banEvasion.source_username,
      display_account: { name: banEvasion.source_display_name },
    },
    t('shared.user.deletedUser'),
  )
  return (
    <div className='flex flex-col gap-0.5 text-xs text-muted-foreground'>
      <Badge
        variant='destructive'
        className='w-fit'
        data-pw='community-ban-evasion-badge'
      >
        <ShieldAlert className='mr-1 size-3' />
        {t('extracted.communities.modQueueBanEvasion.suspectedBanEvasion_c9e82beb')}
      </Badge>
      {hasBanEvasionSource(banEvasion) ? (
        <span>
          {t('extracted.communities.modQueueBanEvasion.matches_6dc54c07')}{' '}
          {banEvasion.source_username ? (
            <Link
              href={createUserPathname(banEvasion.source_username)}
              className='underline'
              prefetch={false}
            >
              {sourceLabel}
            </Link>
          ) : (
            <span>{sourceLabel}</span>
          )}
        </span>
      ) : null}
      {typeof banEvasion.score === 'number' ? (
        <span>
          {t('extracted.communities.modQueueBanEvasion.scoreScore_7595a03f', {
            score: (banEvasion.score * 100).toFixed(0),
          })}
        </span>
      ) : null}
    </div>
  )
}

export function ModQueueBanEvasionActions({
  banEvasion,
  entityId,
  reportId,
  disabled,
  onAction,
}: ModQueueBanEvasionProps) {
  const t = useTranslations()
  const canConfirmBan = hasConfirmableBanEvasionEvidence(banEvasion)

  return (
    <>
      {canConfirmBan ? (
        <Button
          size='sm'
          variant='destructive'
          disabled={disabled}
          data-pw='community-ban-evasion-confirm'
          onClick={() => {
            confirmCommunityBanEvasion(banEvasion.community_id, entityId)
              .then(() => onAction(reportId))
              .catch((err: unknown) =>
                onError(err, {
                  fallback: t(
                    'extracted.communities.modQueueBanEvasion.failedToConfirmBanEvasion_60f5579d',
                  ),
                }),
              )
          }}
        >
          <ShieldAlert className='size-4' />
          {t('extracted.communities.modQueueBanEvasion.confirmBan_bba6cd1f')}
        </Button>
      ) : null}
      <Button
        size='sm'
        variant='outline'
        disabled={disabled}
        data-pw='community-ban-evasion-dismiss'
        onClick={() => {
          dismissCommunityBanEvasion(banEvasion.community_id, entityId)
            .then(() => onAction(reportId))
            .catch((err: unknown) => {
              onError(err, {
                fallback: t(
                  'extracted.communities.modQueueBanEvasion.failedToDismissBanEvasionFlag_cee76e9b',
                ),
              })
            })
        }}
      >
        <X className='size-4' />
        {t('extracted.communities.modQueueBanEvasion.dismissFlag_cffb8297')}
      </Button>
    </>
  )
}
