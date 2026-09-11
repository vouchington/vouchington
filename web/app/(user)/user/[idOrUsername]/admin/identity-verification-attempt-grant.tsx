'use client'

import { useId, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { grantIdentityVerificationAttempt } from '@/lib/api/client/identity-verification'
import { useTranslations } from '@/lib/i18n/use-translations'

export function IdentityVerificationAttemptGrant({ userId }: { userId: string }) {
  const t = useTranslations()
  const noteId = useId()
  const [note, setNote] = useState('')
  const [isGranting, setIsGranting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedNote = note.trim()
    if (!trimmedNote) return
    setIsGranting(true)
    try {
      await grantIdentityVerificationAttempt(userId, trimmedNote)
      setNote('')
      toast.success(t('extracted.admin.identityVerificationAttemptGrant.retryGranted_89ad4ef2'))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('extracted.admin.identityVerificationAttemptGrant.retryFailed_d1edc4b9'),
      )
    } finally {
      setIsGranting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('extracted.admin.identityVerificationAttemptGrant.identityVerification_d948f7a3')}
        </CardTitle>
        <CardDescription>
          {t('extracted.admin.identityVerificationAttemptGrant.description_0b5af2a4')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className='flex max-w-2xl flex-col gap-3'
          onSubmit={handleSubmit}
        >
          <div className='flex flex-col gap-2'>
            <Label htmlFor={noteId}>
              {t('extracted.admin.identityVerificationAttemptGrant.supportNote_4bd8f87e')}
            </Label>
            <Textarea
              id={noteId}
              value={note}
              onChange={event => setNote(event.target.value)}
              maxLength={2000}
              required
              disabled={isGranting}
            />
          </div>
          <Button
            type='submit'
            className='self-start'
            disabled={isGranting || !note.trim()}
            data-pw='user-admin-grant-identity-attempt-button'
          >
            {t('extracted.admin.identityVerificationAttemptGrant.grantRetry_643a7b0c')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
