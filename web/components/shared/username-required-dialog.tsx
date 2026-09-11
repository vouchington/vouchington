'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateMyIdentity } from '@/lib/api/client/my'
import { ApiError } from '@/lib/api/error'
import {
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isUsernameUUID,
} from '@ts-shared/utils/validation-core'
import { SlugAvailability } from '@/components/shared/slug-availability'
import { useAvailabilityCheck } from '@/hooks/use-availability-check'
import { canCheckUsernameAvailability } from '@/components/shared/username-validation'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  open: boolean
  onUsernameSet: () => void
  onClose: () => void
  title?: string
  description?: string
  submitLabel?: string
}

export function UsernameRequiredDialog({
  open,
  onUsernameSet,
  onClose,
  title,
  description,
  submitLabel,
}: Props) {
  const t = useTranslations()
  const resolvedTitle =
    title ?? t('extracted.shared.usernameRequiredDialog.createAUsernameToContinuePosting_3b0d48d5')
  const resolvedDescription =
    description ?? t('extracted.shared.usernameRequiredDialog.aUsernameIsRequiredToPost_d06365c0')
  const resolvedSubmitLabel =
    submitLabel ?? t('extracted.shared.usernameRequiredDialog.createUsernamePost_7d56bfee')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const usernameAvailability = useAvailabilityCheck('username')

  function clearUsername() {
    setUsername('')
    usernameAvailability.reset()
  }

  function handleClose() {
    clearUsername()
    setLoading(false)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    const trimmedUsername = username.trim()
    if (trimmedUsername.length < USERNAME_MIN_LENGTH) return
    if (isUsernameUUID(trimmedUsername)) {
      toast.error(t('extracted.shared.usernameRequiredDialog.usernameCannotBeAUuid_b0564cf3'))
      return
    }
    setLoading(true)
    try {
      await updateMyIdentity({ username: trimmedUsername })
      clearUsername()
      onUsernameSet()
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : t('extracted.shared.usernameRequiredDialog.failedToCreateUsername_8854373c'),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen && !loading) {
          handleClose()
        }
      }}
    >
      <DialogContent
        onPointerDownOutside={event => {
          if (loading) {
            event.preventDefault()
          }
        }}
        onEscapeKeyDown={event => {
          if (loading) {
            event.preventDefault()
          }
        }}
        data-pw='username-required-dialog'
      >
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className='space-y-4'
        >
          <div className='space-y-1'>
            <Label htmlFor='username-dialog-input'>
              {t('extracted.shared.usernameRequiredDialog.username_e3b89e9d')}
            </Label>
            <Input
              id='username-dialog-input'
              value={username}
              onChange={e => {
                setUsername(e.target.value)
                usernameAvailability.reset()
              }}
              onBlur={() => {
                const trimmedUsername = username.trim()
                if (canCheckUsernameAvailability(trimmedUsername)) {
                  usernameAvailability.onBlur(trimmedUsername)
                }
              }}
              placeholder={t('extracted.shared.usernameRequiredDialog.yourUsername_b210fd41')}
              required
              minLength={USERNAME_MIN_LENGTH}
              maxLength={USERNAME_MAX_LENGTH}
              autoComplete='username'
              spellCheck={false}
              autoCapitalize='none'
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              disabled={loading}
              data-pw='username-required-dialog-input'
            />
            <SlugAvailability
              kind='username'
              state={usernameAvailability.state}
            />
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={handleClose}
              disabled={loading}
              data-pw='username-required-dialog-cancel'
            >
              {t('extracted.shared.usernameRequiredDialog.cancel_19766ed6')}
            </Button>
            <Button
              type='submit'
              loading={loading}
              disabled={loading || username.trim().length < USERNAME_MIN_LENGTH}
              data-pw='username-required-dialog-submit'
            >
              {loading
                ? t('extracted.shared.usernameRequiredDialog.creating_def70944')
                : resolvedSubmitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
