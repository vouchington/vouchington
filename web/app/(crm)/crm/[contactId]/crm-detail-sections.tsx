'use client'

import { ContactInfoGrid } from './crm-contact-info-grid'
import { CrmContactEmailHistory } from './crm-contact-email-history'
import { CrmContactNotes } from './crm-contact-notes'
import { StatusTimeline } from './crm-contact-status-timeline'
import type {
  WebCrmContact,
  WebCrmContactSocialAccount,
  WebCrmMessage,
  WebCrmNote,
} from '@/types/crm'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CrmContactInfoSection({
  children,
  contact,
  editing,
  socialAccounts,
}: {
  children: React.ReactNode
  contact: WebCrmContact
  editing: boolean
  socialAccounts: WebCrmContactSocialAccount[]
}) {
  const t = useTranslations()
  return (
    <div className='rounded-lg border bg-card p-4'>
      <h2 className='mb-4 text-sm font-medium text-foreground'>
        {t('extracted.contactid.crmDetailSections.contactInformation_7c01aec3')}
      </h2>
      {editing ? (
        children
      ) : (
        <ContactInfoGrid
          contact={contact}
          socialAccounts={socialAccounts}
        />
      )}
    </div>
  )
}

export function CrmStatusTimelineSection({ contact }: { contact: WebCrmContact }) {
  const t = useTranslations()
  return (
    <div className='rounded-lg border bg-card p-4'>
      <h2 className='mb-4 text-sm font-medium text-foreground'>
        {t('extracted.contactid.crmDetailSections.statusTimeline_e147ccc3')}
      </h2>
      <StatusTimeline contact={contact} />
    </div>
  )
}

export function CrmEmailHistorySection({ messages }: { messages: WebCrmMessage[] }) {
  const t = useTranslations()
  return (
    <div className='rounded-lg border bg-card p-4'>
      <h2 className='mb-4 text-sm font-medium text-foreground'>
        {t('extracted.contactid.crmDetailSections.emailHistory_8a9e0401')}
      </h2>
      <CrmContactEmailHistory messages={messages} />
    </div>
  )
}

export function CrmNotesSection({
  contactId,
  initialNotes,
}: {
  contactId: string
  initialNotes: WebCrmNote[]
}) {
  return (
    <div className='rounded-lg border bg-card p-4'>
      <CrmContactNotes
        contactId={contactId}
        initialNotes={initialNotes}
      />
    </div>
  )
}
