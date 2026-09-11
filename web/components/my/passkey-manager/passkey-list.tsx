'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Passkey } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PasskeyListProps {
  confirmingDeleteId: string | null
  loading: boolean
  passkeys: Passkey[]
  renameName: string
  renamingId: string | null
  onConfirmRemove: (passkeyId: string) => void
  onRemoveClick: (passkeyId: string) => void
  onRename: (passkeyId: string) => void
  setConfirmingDeleteId: (passkeyId: string | null) => void
  setRenameName: (name: string) => void
  setRenamingId: (passkeyId: string | null) => void
}

export function PasskeyList({
  confirmingDeleteId,
  loading,
  passkeys,
  renameName,
  renamingId,
  onConfirmRemove,
  onRemoveClick,
  onRename,
  setConfirmingDeleteId,
  setRenameName,
  setRenamingId,
}: PasskeyListProps) {
  const t = useTranslations()
  return (
    <ul className='space-y-2'>
      {passkeys.map(passkey => (
        <li
          key={passkey.id}
          className='rounded-md border p-4'
          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
          data-pw={`passkey-item-${passkey.id}`}
        >
          {renamingId === passkey.id ? (
            <form
              onSubmit={e => {
                e.preventDefault()
                onRename(passkey.id)
              }}
              className='flex items-center gap-2'
            >
              <Input
                aria-label={t('extracted.passkeyManager.passkeyList.renamePasskey_419f7ffe')}
                value={renameName}
                onChange={e => setRenameName(e.target.value)}
                placeholder={t('extracted.passkeyManager.passkeyList.passkeyName_30a3a952')}
                className='h-8 flex-1'
                required
                maxLength={100}
                data-pw='passkey-rename-input'
              />
              <Button
                type='submit'
                size='sm'
                loading={loading}
                disabled={loading || !renameName.trim()}
              >
                {t('extracted.passkeyManager.passkeyList.save_1509f561')}
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
                {t('extracted.passkeyManager.passkeyList.cancel_19766ed6')}
              </Button>
            </form>
          ) : (
            <div className='flex items-center justify-between'>
              <div className='space-y-0.5'>
                <div className='flex items-center gap-2'>
                  <span
                    className='text-sm font-medium'
                    data-pw='passkey-name'
                  >
                    {passkey.name}
                  </span>
                  {passkey.backed_up && (
                    <span className='rounded bg-green-500/10 px-1.5 py-0.5 text-xs font-medium text-green-600 dark:text-green-400'>
                      {t('extracted.passkeyManager.passkeyList.backedUp_2f2ccea1')}
                    </span>
                  )}
                  <span className='rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>
                    {passkey.device_type === 'multiDevice'
                      ? t('extracted.passkeyManager.passkeyList.multiDevice_1aa01e1f')
                      : t('extracted.passkeyManager.passkeyList.singleDevice_94eac1bc')}
                  </span>
                </div>
                <p
                  className='text-xs text-muted-foreground'
                  suppressHydrationWarning
                >
                  {t('extracted.passkeyManager.passkeyList.addedDate_e7bbba62', {
                    date: new Date(passkey.created_at).toLocaleDateString(),
                  })}
                  {passkey.last_used_at && (
                    <>
                      {' · '}
                      {t('extracted.passkeyManager.passkeyList.lastUsedDate_01c03319', {
                        date: new Date(passkey.last_used_at).toLocaleDateString(),
                      })}
                    </>
                  )}
                </p>
              </div>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    setRenamingId(passkey.id)
                    setRenameName(passkey.name)
                  }}
                  disabled={loading}
                  data-pw='passkey-rename-button'
                >
                  {t('extracted.passkeyManager.passkeyList.rename_3064d79a')}
                </Button>
                {confirmingDeleteId === passkey.id ? (
                  <>
                    <Button
                      variant='destructive'
                      size='sm'
                      onClick={() => onConfirmRemove(passkey.id)}
                      disabled={loading}
                      data-pw='passkey-remove-confirm-button'
                    >
                      {t('extracted.passkeyManager.passkeyList.confirm_eebdd24a')}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => setConfirmingDeleteId(null)}
                      disabled={loading}
                    >
                      {t('extracted.passkeyManager.passkeyList.cancel_19766ed6')}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => onRemoveClick(passkey.id)}
                    disabled={loading}
                    data-pw='passkey-remove-button'
                  >
                    {t('extracted.passkeyManager.passkeyList.remove_c3812fc4')}
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
