'use client'

import { AdminTableShell } from '@/components/admin/admin-table-shell'
import { Button } from '@/components/ui/button'
import { ExternalLink } from '@/components/ui/external-link'
import type { OfficialReferralLink } from '@/lib/api/server/referral-links'
import { useTranslations } from '@/lib/i18n/use-translations'

const OFFICIAL_REFERRAL_LINKS_TABLE_COLUMNS = [
  ['url', 'extracted.officialReferralLinks.officialReferralLinkForm.url_e7a241de'],
  ['label', 'extracted.officialReferralLinks.officialReferralLinkForm.label_0e66373f'],
  ['activated', 'extracted.officialReferralLinks.officialReferralLinkForm.activated_7e7b3a01'],
  ['actions', 'extracted.officialReferralLinks.officialReferralLinkForm.actions_ff8059dc'],
] as const

interface OfficialReferralLinksTableProps {
  links: OfficialReferralLink[]
  deletingId: string | null
  isPending: boolean
  onDelete: (linkId: string) => void
}

export function OfficialReferralLinksTable({
  links,
  deletingId,
  isPending,
  onDelete,
}: OfficialReferralLinksTableProps) {
  const t = useTranslations()

  return (
    <AdminTableShell
      aria-label={t('extracted.referralLinks.referralLinkList.useOurOfficialLinks_1626a49d')}
      isEmpty={links.length === 0}
      emptyMessage={t(
        'extracted.officialReferralLinks.officialReferralLinkForm.noOfficialLinksYetAddOne_94fbb24f',
      )}
    >
      <table
        className='min-w-full divide-y divide-border'
        data-pw='official-referral-links-table'
      >
        <thead className='bg-muted/50'>
          <tr>
            {OFFICIAL_REFERRAL_LINKS_TABLE_COLUMNS.map(([col, messageKey]) => (
              <th
                key={col}
                scope='col'
                className='px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
              >
                {t(messageKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='divide-y divide-border bg-card'>
          {links.map(link => (
            <tr key={link.id}>
              <td className='max-w-xs truncate px-4 py-3 text-sm text-foreground'>
                <ExternalLink
                  href={link.url}
                  className='hover:underline'
                >
                  {link.url}
                </ExternalLink>
              </td>
              <td className='whitespace-nowrap px-4 py-3 text-sm text-muted-foreground'>
                {link.label ?? '—'}
              </td>
              <td className='whitespace-nowrap px-4 py-3 text-sm text-muted-foreground'>
                {link.activated_at ? link.activated_at.slice(0, 10) : '—'}
              </td>
              <td className='whitespace-nowrap px-4 py-3 text-sm'>
                <Button
                  size='sm'
                  variant='destructive'
                  disabled={deletingId === link.id || isPending}
                  onClick={() => onDelete(link.id)}
                  data-pw='official-referral-link-delete'
                >
                  {t('extracted.officialReferralLinks.officialReferralLinkForm.delete_e2d0a549')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableShell>
  )
}
