'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AddEmailFormProps {
  loading: boolean
  newEmail: string
  onCancel: () => void
  onRequestVerification: (event: React.FormEvent) => void
  setNewEmail: (email: string) => void
}

export function AddEmailForm({
  loading,
  newEmail,
  onCancel,
  onRequestVerification,
  setNewEmail,
}: AddEmailFormProps) {
  const t = useTranslations()
  return (
    <form
      onSubmit={onRequestVerification}
      className='space-y-3'
    >
      <div className='space-y-1'>
        <Label htmlFor='new-email'>
          {t('extracted.emailManager.addEmailForm.newEmailAddress_bb0d06f5')}
        </Label>
        <Input
          id='new-email'
          name='new-email'
          type='email'
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder={t('extracted.emailManager.addEmailForm.youExampleCom_53e6cdc3')}
          autoComplete='email'
          inputMode='email'
          spellCheck={false}
          autoCapitalize='none'
          required
        />
      </div>
      <div className='flex gap-2'>
        <Button
          type='submit'
          loading={loading}
          disabled={loading}
        >
          {loading
            ? t('extracted.emailManager.addEmailForm.sending_286a3af7')
            : t('extracted.emailManager.addEmailForm.sendVerificationCode_19e86d2b')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={onCancel}
        >
          {t('extracted.emailManager.addEmailForm.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}
