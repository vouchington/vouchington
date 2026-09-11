'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AddPasskeyFormProps {
  loading: boolean
  newName: string
  onAddPasskey: (event: React.FormEvent) => void
  setNewName: (name: string) => void
  setStep: (step: 'list' | 'add') => void
}

export function AddPasskeyForm({
  loading,
  newName,
  onAddPasskey,
  setNewName,
  setStep,
}: AddPasskeyFormProps) {
  const t = useTranslations()
  return (
    <form
      onSubmit={onAddPasskey}
      className='space-y-3'
    >
      <div className='space-y-1'>
        <Label htmlFor='passkey-name'>
          {t('extracted.passkeyManager.addPasskeyForm.passkeyNameOptional_0100d267')}
        </Label>
        <Input
          id='passkey-name'
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder={t('extracted.passkeyManager.addPasskeyForm.eGMyMacbookIphone_4d12bbf8')}
          maxLength={100}
          data-pw='passkey-name-input'
        />
        <p className='text-xs text-muted-foreground'>
          {t('extracted.passkeyManager.addPasskeyForm.giveThisPasskeyANameTo_9e7d832a')}
        </p>
      </div>
      <div className='flex gap-2'>
        <Button
          type='submit'
          loading={loading}
          disabled={loading}
          data-pw='create-passkey-button'
        >
          {loading
            ? t('extracted.passkeyManager.addPasskeyForm.creating_def70944')
            : t('extracted.passkeyManager.addPasskeyForm.createPasskey_fb92febd')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={() => {
            setStep('list')
            setNewName('')
          }}
        >
          {t('extracted.passkeyManager.addPasskeyForm.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}
