'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import onError, { onSuccess } from '@/lib/on-error'
import { Button } from '@/components/ui/button'
import {
  deleteMyEmailAddress,
  requestMyEmailAddressVerification,
  setPrimaryMyEmailAddress,
  verifyMyEmailAddress,
} from '@/lib/api/client'
import type { EmailAddress } from '@/types/user'
import type { ListResponse } from '@/types/api-responses'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { useEmailAddressPagination } from './email-manager/use-email-address-pagination'
import { AddEmailForm } from './email-manager/add-email-form'
import { EmailList } from './email-manager/email-list'
import { VerifyEmailForm } from './email-manager/verify-email-form'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  initialData?: ListResponse<EmailAddress>
  initialEmailAddresses?: EmailAddress[]
}

type Step = 'list' | 'add' | 'verify'

export function EmailManager({ initialData, initialEmailAddresses }: Props) {
  const t = useTranslations()
  const { emails, pagination, resetToFirstPage, removeEmail, restoreEmail } =
    useEmailAddressPagination(initialData, initialEmailAddresses)
  const handleLoadMore = pagination.loadMore
  const [step, setStep] = useState<Step>('list')
  const [pendingEmail, setPendingEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

  async function handleRequestVerification(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await requestMyEmailAddressVerification(newEmail)
      setPendingEmail(result.email_address)
      setStep('verify')
      toast.info(t('extracted.my.emailManager.verificationCodeSentCheckYourEmail_b2532b31'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.emailManager.failedToSendVerificationCode_6401f8f4'),
        tags: { form: 'my-email-add' },
      })
    } finally {
      setLoading(false)
    }
  }

  async function submitVerify(value: string) {
    submitting.current = true
    setLoading(true)
    try {
      const data = await verifyMyEmailAddress(pendingEmail, value)
      resetToFirstPage?.(data)
      restoreEmail(pendingEmail)
      setStep('list')
      setNewEmail('')
      setToken('')
      setPendingEmail('')
      onSuccess(t('extracted.my.emailManager.emailVerified_bdfb1e4f'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.emailManager.invalidOrExpiredVerificationCode_9b5b98fe'),
        tags: { form: 'my-email-verify' },
      })
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    await submitVerify(token)
  }

  async function handleSetPrimary(emailAddress: string) {
    setLoading(true)
    try {
      const data = await setPrimaryMyEmailAddress(emailAddress)
      resetToFirstPage?.(data)
      onSuccess(t('extracted.my.emailManager.primaryEmailUpdated_9a61888f'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.emailManager.failedToUpdatePrimaryEmail_a080bb12'),
        tags: { form: 'my-email-add' },
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(emailAddress: string) {
    setLoading(true)
    try {
      await deleteMyEmailAddress(emailAddress)
      removeEmail(emailAddress)
      onSuccess(t('extracted.my.emailManager.emailRemoved_89fcd2a8'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.emailManager.failedToRemoveEmailAddress_f0b3111b'),
        tags: { form: 'my-email-add' },
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='space-y-4'>
      <h2 className='text-lg font-semibold'>
        {t('extracted.my.emailManager.emailAddresses_33f2b751')}
      </h2>

      <InfiniteScroll
        hasNextPage={pagination.hasNextPage}
        endCursor={pagination.endCursor}
        onLoadMore={handleLoadMore}
        loadingMore={pagination.loadingMore}
        fetchError={pagination.fetchError}
        clearError={pagination.clearError}
        resetKey={pagination.resetKey}
      >
        <EmailList
          emails={emails}
          loading={loading}
          onRemove={handleRemove}
          onSetPrimary={handleSetPrimary}
        />
      </InfiniteScroll>

      {step === 'list' && (
        <Button
          variant='outline'
          onClick={() => setStep('add')}
        >
          {t('extracted.my.emailManager.addEmailAddress_b4ddcc80')}
        </Button>
      )}

      {step === 'add' && (
        <AddEmailForm
          loading={loading}
          newEmail={newEmail}
          onCancel={() => {
            setStep('list')
            setNewEmail('')
          }}
          onRequestVerification={handleRequestVerification}
          setNewEmail={setNewEmail}
        />
      )}

      {step === 'verify' && (
        <VerifyEmailForm
          loading={loading}
          pendingEmail={pendingEmail}
          submitting={submitting}
          token={token}
          onCancel={() => {
            setStep('list')
            setToken('')
            setPendingEmail('')
          }}
          onSubmit={handleVerify}
          setToken={setToken}
          submitVerify={submitVerify}
        />
      )}
    </div>
  )
}
