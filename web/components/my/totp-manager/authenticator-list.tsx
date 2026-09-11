'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TotpAuthenticator } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AuthenticatorListProps {
  authenticators: TotpAuthenticator[]
  confirmingDeleteId: string | null
  loading: boolean
  renameName: string
  renamingId: string | null
  onConfirmRemove: (authenticatorId: string) => void
  onRemoveClick: (authenticatorId: string) => void
  onRename: (authenticatorId: string) => void
  setConfirmingDeleteId: (authenticatorId: string | null) => void
  setRenameName: (name: string) => void
  setRenamingId: (authenticatorId: string | null) => void
}

export function AuthenticatorList({
  authenticators,
  confirmingDeleteId,
  loading,
  renameName,
  renamingId,
  onConfirmRemove,
  onRemoveClick,
  onRename,
  setConfirmingDeleteId,
  setRenameName,
  setRenamingId,
}: AuthenticatorListProps) {
  const t = useTranslations()
  return (
    <ul className='space-y-2'>
      {authenticators.map(authenticator => (
        <li
          key={authenticator.id}
          className='rounded-md border p-4'
          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
          data-pw={`totp-authenticator-item-${authenticator.id}`}
        >
          {renamingId === authenticator.id ? (
            <form
              onSubmit={e => {
                e.preventDefault()
                onRename(authenticator.id)
              }}
              className='flex items-center gap-2'
            >
              <Input
                aria-label={t(
                  'extracted.totpManager.authenticatorList.renameAuthenticator_f453ab19',
                )}
                value={renameName}
                onChange={e => setRenameName(e.target.value)}
                placeholder={t(
                  'extracted.totpManager.authenticatorList.authenticatorName_7daff91c',
                )}
                className='h-8 flex-1'
                required
                maxLength={100}
                data-pw='totp-rename-input'
              />
              <Button
                type='submit'
                size='sm'
                loading={loading}
                disabled={loading || !renameName.trim()}
              >
                {t('extracted.totpManager.authenticatorList.save_1509f561')}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => {
                  setRenamingId(null)
                  setRenameName('')
                }}
              >
                {t('extracted.totpManager.authenticatorList.cancel_19766ed6')}
              </Button>
            </form>
          ) : (
            <div className='flex items-center justify-between'>
              <div className='space-y-0.5'>
                <span
                  className='text-sm font-medium'
                  data-pw='totp-authenticator-name'
                >
                  {authenticator.name}
                </span>
                <p
                  className='text-xs text-muted-foreground'
                  suppressHydrationWarning
                >
                  {t('extracted.totpManager.authenticatorList.addedDate_e7bbba62', {
                    date: new Date(authenticator.created_at).toLocaleDateString(),
                  })}
                </p>
              </div>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    setRenamingId(authenticator.id)
                    setRenameName(authenticator.name)
                  }}
                  disabled={loading}
                  data-pw='totp-rename-button'
                >
                  {t('extracted.totpManager.authenticatorList.rename_3064d79a')}
                </Button>
                {confirmingDeleteId === authenticator.id ? (
                  <>
                    <Button
                      variant='destructive'
                      size='sm'
                      onClick={() => onConfirmRemove(authenticator.id)}
                      disabled={loading}
                      data-pw='totp-remove-confirm-button'
                    >
                      {t('extracted.totpManager.authenticatorList.confirm_eebdd24a')}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setConfirmingDeleteId(null)}
                      disabled={loading}
                    >
                      {t('extracted.totpManager.authenticatorList.cancel_19766ed6')}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => onRemoveClick(authenticator.id)}
                    disabled={loading}
                    data-pw='totp-remove-button'
                  >
                    {t('extracted.totpManager.authenticatorList.remove_c3812fc4')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
