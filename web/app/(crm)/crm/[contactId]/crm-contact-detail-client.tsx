'use client'

import { useReducer } from 'react'
import { useRouter } from 'next/navigation'
import onError, { onSuccess } from '@/lib/on-error'
import {
  updateCrmContact,
  deleteCrmContact,
  linkCrmContactToUser,
  unlinkCrmContact,
} from '@/lib/api/client/crm'
import { deriveCrmContactStatus } from './crm-contact-status'
import { CrmAccountLinkPanel } from './crm-account-link-panel'
import { CrmContactActions } from './crm-contact-actions'
import { CrmContactEditForm, type CrmContactEditFields } from './crm-contact-edit-form'
import {
  CrmContactInfoSection,
  CrmEmailHistorySection,
  CrmNotesSection,
  CrmStatusTimelineSection,
} from './crm-detail-sections'
import type {
  WebCrmContact,
  WebCrmContactSocialAccount,
  WebCrmMessage,
  WebCrmNote,
  CrmContactVertical,
} from '@/types/crm'
import {
  type CrmContactDetailState,
  makeInitialState,
  getEditFields,
} from './crm-contact-detail-model'
import { useTranslations } from '@/lib/i18n/use-translations'

type Action =
  | Partial<CrmContactDetailState>
  | ((state: CrmContactDetailState) => Partial<CrmContactDetailState>)

function reducer(state: CrmContactDetailState, action: Action): CrmContactDetailState {
  return { ...state, ...(typeof action === 'function' ? action(state) : action) }
}

interface Props {
  contact: WebCrmContact
  socialAccounts: WebCrmContactSocialAccount[]
  initialMessages: WebCrmMessage[]
  initialNotes: WebCrmNote[]
}

export function CrmContactDetailClient({
  contact: initialContact,
  socialAccounts,
  initialMessages,
  initialNotes,
}: Props) {
  const t = useTranslations()
  const { push } = useRouter()
  const [state, dispatch] = useReducer(reducer, makeInitialState(initialContact, initialMessages))

  const status = deriveCrmContactStatus(state.contact)

  function handleCancelEdit() {
    dispatch({ editing: false, fields: getEditFields(state.contact) })
  }

  function handleFieldChange(field: keyof CrmContactEditFields, value: string) {
    dispatch(s => ({ fields: { ...s.fields, [field]: value } }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    dispatch({ saving: true })
    try {
      const { contact: updated } = await updateCrmContact(state.contact.id, {
        name: state.fields.name.trim() || undefined,
        email: state.fields.email.trim() || undefined,
        phone: state.fields.phone.trim() || null,
        vertical:
          state.fields.vertical !== 'none' ? (state.fields.vertical as CrmContactVertical) : null,
        follower_count:
          state.fields.followerCount !== '' ? parseInt(state.fields.followerCount, 10) : null,
        notes: state.fields.notes.trim() || null,
      })
      dispatch({ contact: updated, editing: false, fields: getEditFields(updated) })
      onSuccess(t('extracted.contactid.crmContactDetailClient.contactUpdated_d99bdbe4'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.contactid.crmContactDetailClient.failedToUpdateContact_c9410f6c'),
        tags: { form: 'crm-contact' },
      })
    } finally {
      dispatch({ saving: false })
    }
  }

  async function handleArchive() {
    if (!state.confirmArchive) {
      dispatch({ confirmArchive: true })
      return
    }
    dispatch({ archiving: true })
    try {
      await deleteCrmContact(state.contact.id)
      onSuccess(t('extracted.contactid.crmContactDetailClient.contactArchived_f1f0f00a'))
      push('/crm')
    } catch (error) {
      onError(error, {
        fallback: t('extracted.contactid.crmContactDetailClient.failedToArchiveContact_0c912f97'),
        tags: { form: 'crm-contact' },
      })
      dispatch({ archiving: false, confirmArchive: false })
    }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault()
    if (!state.linkUserId.trim()) return
    dispatch({ linking: true })
    try {
      const { contact: updated } = await linkCrmContactToUser(
        state.contact.id,
        state.linkUserId.trim(),
      )
      dispatch({ contact: updated, linkUserId: '' })
      onSuccess(t('extracted.contactid.crmContactDetailClient.accountLinked_6e24333d'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.contactid.crmContactDetailClient.failedToLinkAccount_2381ac90'),
        tags: { form: 'crm-account-link' },
      })
    } finally {
      dispatch({ linking: false })
    }
  }

  async function handleUnlink() {
    dispatch({ unlinking: true })
    try {
      const { contact: updated } = await unlinkCrmContact(state.contact.id)
      dispatch({ contact: updated })
      onSuccess(t('extracted.contactid.crmContactDetailClient.accountUnlinked_33f1cdf2'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.contactid.crmContactDetailClient.failedToUnlinkAccount_3200d94b'),
        tags: { form: 'crm-account-link' },
      })
    } finally {
      dispatch({ unlinking: false })
    }
  }

  function handleEmailSent(message: WebCrmMessage) {
    dispatch(s => ({ messages: [message, ...s.messages] }))
  }

  return (
    <div className='space-y-6'>
      <CrmContactActions
        archiving={state.archiving}
        confirmArchive={state.confirmArchive}
        contactId={state.contact.id}
        editing={state.editing}
        onArchive={handleArchive}
        onConfirmArchiveChange={v => dispatch({ confirmArchive: v })}
        onEditingChange={v => dispatch({ editing: v })}
        onEmailSent={handleEmailSent}
        status={status}
      />
      <CrmContactInfoSection
        contact={state.contact}
        editing={state.editing}
        socialAccounts={socialAccounts}
      >
        <CrmContactEditForm
          fields={state.fields}
          onCancel={handleCancelEdit}
          onFieldChange={handleFieldChange}
          onSave={handleSave}
          saving={state.saving}
        />
      </CrmContactInfoSection>
      <CrmAccountLinkPanel
        contact={state.contact}
        linkUserId={state.linkUserId}
        linking={state.linking}
        onLink={handleLink}
        onLinkUserIdChange={v => dispatch({ linkUserId: v })}
        onUnlink={handleUnlink}
        unlinking={state.unlinking}
      />
      <CrmStatusTimelineSection contact={state.contact} />
      <CrmEmailHistorySection messages={state.messages} />
      <CrmNotesSection
        contactId={state.contact.id}
        initialNotes={initialNotes}
      />
    </div>
  )
}
