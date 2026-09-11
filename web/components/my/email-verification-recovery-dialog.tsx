'use client'

import { useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AddEmailForm } from './email-manager/add-email-form'
import { VerifyEmailForm } from './email-manager/verify-email-form'
import { requestMyEmailAddressVerification, verifyMyEmailAddress } from '@/lib/api/client'
import onError from '@/lib/on-error'

export function EmailVerificationRecoveryDialog({
  open,
  onOpenChange,
  onVerified,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified: () => void
}) {
  const [step, setStep] = useState<'add' | 'verify'>('add')
  const [email, setEmail] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const submitting = useRef(false)

  function reset() {
    setStep('add')
    setEmail('')
    setPendingEmail('')
    setToken('')
  }

  function close() {
    reset()
    onOpenChange(false)
  }

  async function requestVerification(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    try {
      const result = await requestMyEmailAddressVerification(email)
      setPendingEmail(result.email_address)
      setStep('verify')
    } catch (error) {
      onError(error, {
        fallback: 'Failed to send verification code.',
        tags: { form: 'email-recovery-add' },
      })
    } finally {
      setLoading(false)
    }
  }

  async function verify(value: string) {
    if (submitting.current) return
    submitting.current = true
    setLoading(true)
    try {
      await verifyMyEmailAddress(pendingEmail, value)
      reset()
      onVerified()
    } catch (error) {
      onError(error, {
        fallback: 'Invalid or expired verification code.',
        tags: { form: 'email-recovery-verify' },
      })
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => (next ? onOpenChange(true) : close())}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify your email</DialogTitle>
          <DialogDescription>
            Add and verify an email address, then try your action again.
          </DialogDescription>
        </DialogHeader>
        {step === 'add' ? (
          <AddEmailForm
            loading={loading}
            newEmail={email}
            onCancel={close}
            onRequestVerification={requestVerification}
            setNewEmail={setEmail}
          />
        ) : (
          <VerifyEmailForm
            loading={loading}
            pendingEmail={pendingEmail}
            submitting={submitting}
            token={token}
            onCancel={close}
            onSubmit={event => {
              event.preventDefault()
              void verify(token)
            }}
            setToken={setToken}
            submitVerify={value => {
              void verify(value)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
