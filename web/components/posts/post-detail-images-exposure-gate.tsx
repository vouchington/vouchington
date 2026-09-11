'use client'

import type { ReactNode } from 'react'
import { ExposureCooldownGate } from '@/components/moderation/exposure-cooldown-gate'
import { SensitiveMedia } from '@/components/moderation/sensitive-media'
import { useExposureCooldown } from '@/components/moderation/use-exposure-cooldown'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ExposureGatedPostImages({
  children,
  postId,
}: {
  children: ReactNode
  postId: string
}) {
  const cooldown = useExposureCooldown()
  const t = useTranslations()

  return (
    <ExposureCooldownGate cooldown={cooldown}>
      <div className='flex flex-col gap-2'>
        <SensitiveMedia
          disabled={cooldown.revealBlocked}
          onReveal={() => cooldown.recordReveal({ postId, surface: 'post_page' })}
        >
          {children}
        </SensitiveMedia>
        {cooldown.exposureStateIsStale && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='self-start'
            onClick={() => {
              void cooldown.refreshExposureState()
            }}
          >
            {t('extracted.shared.paginatedListFooter.retry_942087cc')}
          </Button>
        )}
      </div>
    </ExposureCooldownGate>
  )
}
