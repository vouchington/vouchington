'use client'

import { useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  confirmCommunityBanEvasion,
  dismissCommunityBanEvasion,
} from '@/lib/api/client/community-ban-evasion'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError from '@/lib/on-error'
import type { AdminModerationReport } from './reports-client-types'

type BanEvasionAction = 'confirm' | 'dismiss'

export function ReportBanEvasionActions({
  disabled,
  onAction,
  report,
}: {
  disabled: boolean
  onAction?: (reportId: string) => void
  report: AdminModerationReport
}) {
  const t = useTranslations()
  const [pendingAction, setPendingAction] = useState<BanEvasionAction | null>(null)
  const banEvasion = report.community_ban_evasion
  if (report.status !== 'pending' || !report.is_system_generated || !banEvasion) {
    return null
  }

  const targetLabel = report.target_label ?? report.entity_id
  const communityId = banEvasion.community_id
  const actionDisabled = disabled || pendingAction !== null

  async function runAction(action: BanEvasionAction) {
    if (actionDisabled) return
    setPendingAction(action)
    try {
      if (action === 'confirm') {
        await confirmCommunityBanEvasion(communityId, report.entity_id)
      } else {
        await dismissCommunityBanEvasion(communityId, report.entity_id)
      }
      onAction?.(report.id)
    } catch (error) {
      onError(error, {
        fallback:
          action === 'confirm'
            ? t('extracted.admin.adminReportRow.failedToConfirmBanEvasion_60f5579d')
            : t('extracted.admin.adminReportRow.failedToDismissBanEvasionFlag_cee76e9b'),
      })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <>
      <Button
        size='touchSm'
        variant='destructive'
        data-pw='ban-evasion-confirm'
        disabled={actionDisabled}
        aria-label={t('extracted.admin.adminReportRow.confirmBanEvasionForTargetlabel_20815620', {
          targetLabel,
        })}
        onClick={() => {
          void runAction('confirm')
        }}
      >
        <ShieldAlert className='size-4' />
        {t('extracted.admin.adminReportRow.confirmBan_bba6cd1f')}
      </Button>
      <Button
        size='touchSm'
        variant='outline'
        data-pw='ban-evasion-dismiss'
        disabled={actionDisabled}
        aria-label={t(
          'extracted.admin.adminReportRow.dismissBanEvasionFlagForTargetlabel_bb278398',
          { targetLabel },
        )}
        onClick={() => {
          void runAction('dismiss')
        }}
      >
        <X className='size-4' />
        {t('extracted.admin.adminReportRow.dismissFlag_cffb8297')}
      </Button>
    </>
  )
}
