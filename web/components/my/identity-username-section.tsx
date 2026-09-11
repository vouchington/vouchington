'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SlugAvailability } from '@/components/shared/slug-availability'
import type { useAvailabilityCheck } from '@/hooks/use-availability-check'
import { canCheckUsernameAvailability } from '@/components/shared/username-validation'
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '@ts-shared/utils/validation-core'
import { useTranslations } from '@/lib/i18n/use-translations'

interface IdentityUsernameSectionProps {
  username: string
  initialUsername: string | null
  hasOAuthAccount: boolean
  usernameLoading: boolean
  usernameAvailability: ReturnType<typeof useAvailabilityCheck>
  onUsernameChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
}

export function IdentityUsernameSection({
  username,
  initialUsername,
  hasOAuthAccount,
  usernameLoading,
  usernameAvailability,
  onUsernameChange,
  onSubmit,
}: IdentityUsernameSectionProps) {
  const t = useTranslations()
  return (
    <div>
      <h2
        className='text-lg font-semibold'
        data-pw='identity-username-heading'
      >
        {t('extracted.my.identityForm.username_e3b89e9d')}
      </h2>
      <form
        onSubmit={onSubmit}
        className='mt-3 space-y-3'
      >
        <div className='space-y-1'>
          <Label htmlFor='username'>{t('extracted.my.identityForm.username_e3b89e9d')}</Label>
          <Input
            id='username'
            name='username'
            value={username}
            onChange={e => {
              onUsernameChange(e.target.value)
              usernameAvailability.reset()
            }}
            onBlur={() => {
              if (username !== initialUsername && canCheckUsernameAvailability(username)) {
                usernameAvailability.onBlur(username)
              }
            }}
            placeholder={t('extracted.my.identityForm.yourUsername_b210fd41')}
            required={!hasOAuthAccount}
            minLength={USERNAME_MIN_LENGTH}
            maxLength={USERNAME_MAX_LENGTH}
            autoComplete='username'
            spellCheck={false}
            autoCapitalize='none'
            data-pw='identity-username-input'
          />
          <SlugAvailability
            kind='username'
            state={usernameAvailability.state}
          />
        </div>
        <Button
          type='submit'
          loading={usernameLoading}
          disabled={usernameLoading || username === initialUsername}
          data-pw='identity-save-username-button'
        >
          {usernameLoading
            ? t('extracted.my.identityUsernameSection.saving_dc85af8f')
            : t('extracted.my.identityUsernameSection.saveUsername_00cb8573')}
        </Button>
      </form>
    </div>
  )
}
