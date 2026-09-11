import Link from 'next/link'
import { AdminTableShell } from '@/components/admin/admin-table-shell'
import type { ReferralLinkValidation } from '@/lib/api/client/referral-link-validations'
import { getTranslations } from '@/lib/i18n/get-translations'

interface ValidationsListTableProps {
  validations: ReferralLinkValidation[]
  /** Base path for validation links, e.g. `/referral-program/<slug>/validations`. */
  basePath: string
}

/**
 * Presentational table of referral-link validation sets. Scoped under a referral
 * program via `basePath` so links resolve to the program's validation routes.
 */
export async function ValidationsListTable({ validations, basePath }: ValidationsListTableProps) {
  const t = await getTranslations()
  return (
    <AdminTableShell
      aria-label={t(
        'extracted.referralLinkValidations.validationsListTable.referralLinkValidations_d32933eb',
      )}
      isEmpty={validations.length === 0}
      emptyMessage={t(
        'extracted.referralLinkValidations.validationsListTable.noValidationSetsFoundCreateOne_333198eb',
      )}
    >
      <table
        className='min-w-full divide-y divide-border'
        data-pw='referral-link-validations-table'
      >
        <thead className='bg-muted/50'>
          <tr>
            <th
              scope='col'
              className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
            >
              {t('extracted.referralLinkValidations.validationsListTable.slug_d15387ec')}
            </th>
            <th
              scope='col'
              className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
            >
              {t('extracted.referralLinkValidations.validationsListTable.userHelpText_f4348908')}
            </th>
            <th
              scope='col'
              className='px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground'
            >
              {t('extracted.referralLinkValidations.validationsListTable.updated_3a5ecca1')}
            </th>
          </tr>
        </thead>
        <tbody className='divide-y divide-border bg-card'>
          {validations.map(v => (
            <tr key={v.id}>
              <td className='whitespace-nowrap px-6 py-4 text-sm font-medium text-foreground'>
                <Link
                  prefetch={false}
                  href={`${basePath}/${v.id}`}
                  // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                  data-pw={`validation-link-${v.id}`}
                  className='text-primary hover:text-primary/80'
                >
                  {v.slug}
                </Link>
              </td>
              <td className='max-w-sm truncate px-6 py-4 text-sm text-muted-foreground'>
                {v.user_help_text || '—'}
              </td>
              <td
                className='whitespace-nowrap px-6 py-4 text-sm text-muted-foreground'
                suppressHydrationWarning
              >
                {new Date(v.updated_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminTableShell>
  )
}
