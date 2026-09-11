'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { UserReferralLinkWithDetails } from '@/types/api-responses'
import { truncateUrl, type ProgramGroup } from '../referral-links-manager-utils'
import { ReferralLinkActions, ReferralLinkStatus } from './referral-link-actions'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ReferralLinkGroupsProps {
  confirmingDeleteId: string | null
  editLabel: string
  editingId: string | null
  groups: ProgramGroup[]
  hasPlusTier: boolean
  loadingIds: Set<string>
  onDelete: (id: string) => void
  onSaveLabel: (link: UserReferralLinkWithDetails) => void
  onToggleActive: (link: UserReferralLinkWithDetails) => void
  onUnfurl: (link: UserReferralLinkWithDetails) => void
  setConfirmingDeleteId: (id: string | null) => void
  setEditLabel: (label: string) => void
  setEditingId: (id: string | null) => void
}

export function ReferralLinkGroups({
  confirmingDeleteId,
  editLabel,
  editingId,
  groups,
  hasPlusTier,
  loadingIds,
  onDelete,
  onSaveLabel,
  onToggleActive,
  onUnfurl,
  setConfirmingDeleteId,
  setEditLabel,
  setEditingId,
}: ReferralLinkGroupsProps) {
  const t = useTranslations()
  if (groups.length === 0) {
    return (
      <p className='rounded-lg border p-6 text-center text-sm text-muted-foreground'>
        {t('extracted.referralLinksManager.referralLinkGroups.youHavenTAddedAnyReferral_4d49b2e9')}
      </p>
    )
  }

  return (
    <div className='space-y-4'>
      {groups.map(group => (
        <div
          key={group.programId}
          className='rounded-md border'
        >
          <div className='border-b bg-muted/50 px-4 py-3'>
            <h3 className='text-sm font-semibold'>{group.programName}</h3>
          </div>
          <ul className='divide-y'>
            {group.links.map(link => (
              <ReferralLinkRow
                key={link.id}
                confirmingDeleteId={confirmingDeleteId}
                editLabel={editLabel}
                editingId={editingId}
                hasPlusTier={hasPlusTier}
                link={link}
                loadingIds={loadingIds}
                onDelete={onDelete}
                onSaveLabel={onSaveLabel}
                onToggleActive={onToggleActive}
                onUnfurl={onUnfurl}
                setConfirmingDeleteId={setConfirmingDeleteId}
                setEditLabel={setEditLabel}
                setEditingId={setEditingId}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ReferralLinkRow({
  confirmingDeleteId,
  editLabel,
  editingId,
  hasPlusTier,
  link,
  loadingIds,
  onDelete,
  onSaveLabel,
  onToggleActive,
  onUnfurl,
  setConfirmingDeleteId,
  setEditLabel,
  setEditingId,
}: Omit<ReferralLinkGroupsProps, 'groups'> & { link: UserReferralLinkWithDetails }) {
  const t = useTranslations()
  return (
    <li className='p-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0 space-y-1'>
          <p
            className='break-all text-sm text-muted-foreground'
            title={link.url}
          >
            {truncateUrl(link.url)}
          </p>
          {editingId === link.id ? (
            <div className='flex items-center gap-2'>
              <Label
                htmlFor={`label-${link.id}`}
                className='sr-only'
              >
                {t('extracted.referralLinksManager.referralLinkGroups.label_0e66373f')}
              </Label>
              <Input
                id={`label-${link.id}`}
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                placeholder={t(
                  'extracted.referralLinksManager.referralLinkGroups.labelOptional_7df60caf',
                )}
                className='h-8 max-w-xs text-sm'
              />
              <Button
                size='sm'
                onClick={() => onSaveLabel(link)}
                disabled={loadingIds.has(`edit-${link.id}`)}
              >
                {t('extracted.referralLinksManager.referralLinkGroups.save_1509f561')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={() => setEditingId(null)}
              >
                {t('extracted.referralLinksManager.referralLinkGroups.cancel_19766ed6')}
              </Button>
            </div>
          ) : (
            <p className='text-sm'>
              {link.label ? (
                link.label
              ) : (
                <span className='text-muted-foreground'>
                  {t('extracted.referralLinksManager.referralLinkGroups.noLabel_d6728773')}
                </span>
              )}
            </p>
          )}
          <ReferralLinkStatus link={link} />
        </div>
        <ReferralLinkActions
          confirmingDeleteId={confirmingDeleteId}
          hasPlusTier={hasPlusTier}
          link={link}
          loadingIds={loadingIds}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          onUnfurl={onUnfurl}
          setConfirmingDeleteId={setConfirmingDeleteId}
          setEditLabel={setEditLabel}
          setEditingId={setEditingId}
        />
      </div>
    </li>
  )
}
