'use client'

import { Button } from '@/components/ui/button'
import type { UserReferralLinkWithDetails } from '@/types/api-responses'
import { isActive, getUnfurlStatus, type UnfurlStatus } from '../referral-links-manager-utils'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { MessageKey } from '@ts-shared/ui-messages'

interface ReferralLinkActionsProps {
  confirmingDeleteId: string | null
  hasPlusTier: boolean
  link: UserReferralLinkWithDetails
  loadingIds: Set<string>
  onDelete: (id: string) => void
  onToggleActive: (link: UserReferralLinkWithDetails) => void
  onUnfurl: (link: UserReferralLinkWithDetails) => void
  setConfirmingDeleteId: (id: string | null) => void
  setEditLabel: (label: string) => void
  setEditingId: (id: string | null) => void
}

// Keys are looked up by useTranslations() inline below (t(UNFURL_BUTTON_LABEL_KEY[status])) rather
// than inlined into JSX text, since the label is derived from a 4-way status, not a boolean ternary
// the i18n-extract codemod can splice directly.
const UNFURL_BUTTON_LABEL_KEY: Record<UnfurlStatus, MessageKey> = {
  never: 'extracted.referralLinksManager.referralLinkActions.unfurl_767a3048',
  pending: 'extracted.referralLinksManager.referralLinkActions.unfurling_e1bb00da',
  completed: 'extracted.referralLinksManager.referralLinkActions.reUnfurl_02322ad5',
  failed: 'extracted.referralLinksManager.referralLinkActions.retryUnfurl_4ad0043f',
}

export function ReferralLinkStatus({ link }: { link: UserReferralLinkWithDetails }) {
  const t = useTranslations()
  return (
    <div
      className='flex items-center gap-1.5'
      title={
        isActive(link)
          ? t(
              'extracted.referralLinksManager.referralLinkActions.activeEligibleToAppearOnPublic_96d8ede6',
            )
          : t(
              'extracted.referralLinksManager.referralLinkActions.inactiveNotShownOnPublicPages_3054bb99',
            )
      }
    >
      <span
        className={`h-2 w-2 rounded-full ${isActive(link) ? 'bg-green-500' : 'bg-muted-foreground'}`}
      />
      <span className='text-xs text-muted-foreground'>
        {isActive(link)
          ? t('extracted.referralLinksManager.referralLinkActions.active_92340695')
          : t('extracted.referralLinksManager.referralLinkActions.inactive_ac7c949f')}
      </span>
    </div>
  )
}

export function ReferralLinkActions({
  confirmingDeleteId,
  hasPlusTier,
  link,
  loadingIds,
  onDelete,
  onToggleActive,
  onUnfurl,
  setConfirmingDeleteId,
  setEditLabel,
  setEditingId,
}: ReferralLinkActionsProps) {
  const t = useTranslations()
  const unfurlStatus = getUnfurlStatus(link)
  const unfurlPending = unfurlStatus === 'pending' || loadingIds.has(`unfurl-${link.id}`)
  return (
    <div className='flex shrink-0 flex-wrap gap-2'>
      <Button
        size='sm'
        variant='outline'
        onClick={() => {
          setEditingId(link.id)
          setEditLabel(link.label ?? '')
        }}
      >
        {t('extracted.referralLinksManager.referralLinkActions.editLabel_6756cc16')}
      </Button>
      <Button
        size='sm'
        variant='outline'
        onClick={() => onToggleActive(link)}
        disabled={loadingIds.has(`toggle-${link.id}`)}
      >
        {isActive(link)
          ? t('extracted.referralLinksManager.referralLinkActions.deactivate_fb1e6fa5')
          : t('extracted.referralLinksManager.referralLinkActions.activate_24433c70')}
      </Button>
      {link.referral_program_slug === 'amex-referral-program' && (
        <span
          title={
            !hasPlusTier
              ? t(
                  'extracted.referralLinksManager.referralLinkActions.unfurlingAmexAllCardsLinksRequires_124537b4',
                )
              : (link.unfurl_last_error ?? undefined)
          }
        >
          <Button
            size='sm'
            variant='outline'
            onClick={() => onUnfurl(link)}
            disabled={!hasPlusTier || unfurlPending}
          >
            {t(UNFURL_BUTTON_LABEL_KEY[unfurlStatus])}
          </Button>
        </span>
      )}
      {confirmingDeleteId === link.id ? (
        <>
          <span className='self-center text-sm text-destructive'>
            {t('extracted.referralLinksManager.referralLinkActions.remove_9fe2f243')}
          </span>
          <Button
            size='sm'
            variant='destructive'
            onClick={() => onDelete(link.id)}
            disabled={loadingIds.has(`delete-${link.id}`)}
          >
            {t('extracted.referralLinksManager.referralLinkActions.confirm_eebdd24a')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setConfirmingDeleteId(null)}
          >
            {t('extracted.referralLinksManager.referralLinkActions.cancel_19766ed6')}
          </Button>
        </>
      ) : (
        <Button
          size='sm'
          variant='outline'
          onClick={() => setConfirmingDeleteId(link.id)}
        >
          {t('extracted.referralLinksManager.referralLinkActions.delete_e2d0a549')}
        </Button>
      )}
    </div>
  )
}
