'use client'

import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { WebCrmContact, WebCrmContactSocialAccount } from '@/types/crm'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ContactInfoGrid({
  contact,
  socialAccounts,
}: {
  contact: WebCrmContact
  socialAccounts: WebCrmContactSocialAccount[]
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
      <InfoRow
        label='Name'
        value={contact.name}
      />
      <InfoRow
        label='Email'
        value={contact.email}
      />
      <InfoRow
        label='Phone'
        value={contact.phone ?? '—'}
      />
      <InfoRow
        label='Vertical'
        value={contact.vertical ?? '—'}
      />
      <InfoRow
        label='Followers'
        value={
          contact.follower_count != null ? formatNumber(contact.follower_count, uiLocale) : '—'
        }
      />
      <InfoRow
        label='Type'
        value={contact.contact_type}
      />
      <InfoRow
        label='Source'
        value={contact.source}
      />
      {contact.notes && (
        <div className='sm:col-span-2'>
          <InfoRow
            label='Notes'
            value={contact.notes}
          />
        </div>
      )}
      {socialAccounts.length > 0 && (
        <div className='sm:col-span-2'>
          <p className='mb-2 text-xs font-medium uppercase text-muted-foreground'>
            {t('extracted.contactid.crmContactInfoGrid.socialAccounts_be6b7fee')}
          </p>
          <div className='flex flex-wrap gap-3'>
            {socialAccounts.map(sa => (
              <span
                key={sa.id}
                // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                data-pw={`crm-social-account-${sa.handle}`}
                className='rounded-full border bg-muted/50 px-3 py-1 text-xs text-foreground'
              >
                {t('extracted.contactid.crmContactInfoGrid.platformHandle_ffbad851', {
                  platform: sa.platform,
                  handle: sa.handle,
                })}
                {sa.follower_count != null && (
                  <span className='ml-1 text-muted-foreground'>
                    {t('extracted.contactid.crmContactInfoGrid.count_ae7cbb64', {
                      count: formatNumber(sa.follower_count, uiLocale),
                    })}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const slug = label.toLowerCase().replaceAll(/\s+/g, '-')
  return (
    <div>
      <p className='text-xs font-medium uppercase text-muted-foreground'>{label}</p>
      <p
        className='mt-0.5 text-sm text-foreground'
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier derived from label
        data-pw={`crm-contact-info-${slug}`}
      >
        {value}
      </p>
    </div>
  )
}
