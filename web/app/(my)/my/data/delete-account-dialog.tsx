'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { logout } from '@/lib/auth/logout'
import { deleteUser } from '@/lib/api/client/users'
import onError from '@/lib/on-error'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'

const CONFIRM_PHRASE = 'delete my account'

interface Props {
  userId: string
}

export function DeleteAccountDialog({ userId }: Props) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { refresh } = useRouter()

  const isConfirmed = confirmation === CONFIRM_PHRASE

  const handleDelete = async () => {
    if (!isConfirmed) return
    setLoading(true)
    setError(null)

    try {
      const data = await deleteUser(userId)
      if (data.logout) {
        await logout()
      } else {
        setOpen(false)
        refresh()
      }
    } catch (error) {
      setError(
        onError(error, {
          fallback: t('extracted.data.deleteAccountDialog.anUnexpectedErrorOccurred_6615bf1c'),
          tags: { form: 'delete-account' },
        }),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        setOpen(isOpen)
        setConfirmation('')
        setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant='destructive'
          data-pw='delete-account-open-dialog'
        >
          {t('extracted.data.deleteAccountDialog.deleteAccount_c031bf99')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('extracted.data.deleteAccountDialog.deleteAccount_c031bf99')}
          </DialogTitle>
          <DialogDescription data-pw='delete-account-dialog-description'>
            {t('extracted.data.deleteAccountDialog.thisActionIsPermanentAndCannot_3865fdc9')}
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-2'>
          <div className='space-y-2'>
            <Label htmlFor='confirmation'>
              {t('extracted.data.deleteAccountDialog.typePhraseToConfirm_aa1b0589', {
                phrase: CONFIRM_PHRASE,
              })}
            </Label>
            <Input
              id='confirmation'
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoComplete='off'
              data-pw='delete-account-confirmation-input'
            />
          </div>
          {error && <p className='text-sm text-destructive'>{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => setOpen(false)}
            data-pw='delete-account-cancel-button'
          >
            {t('extracted.data.deleteAccountDialog.cancel_19766ed6')}
          </Button>
          <Button
            variant='destructive'
            loading={loading}
            disabled={!isConfirmed || loading}
            onClick={handleDelete}
            data-pw='delete-account-confirm-button'
          >
            {loading
              ? t('extracted.data.deleteAccountDialog.deleting_7b8c9d0e')
              : t('extracted.data.deleteAccountDialog.deleteMyAccount_1f2a3b4c')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
