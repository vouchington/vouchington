'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLoadingIds } from '@/hooks/use-loading-ids'
import onError, { onSuccess } from '@/lib/on-error'
import { updateMyIdentityVerificationDisplayPreferences } from '@/lib/api/client/identity-verification'
import type { PublicVerifiedNameDisplay } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface VerifiedDisplayPreferencesCardProps {
  verifiedBadgeVisible: boolean
  publicVerifiedNameDisplay: PublicVerifiedNameDisplay
}

export function VerifiedDisplayPreferencesCard({
  verifiedBadgeVisible: initialBadgeVisible,
  publicVerifiedNameDisplay: initialNameDisplay,
}: VerifiedDisplayPreferencesCardProps) {
  const t = useTranslations()
  const { runWithLoadingId, loadingIds } = useLoadingIds()
  const [badgeVisible, setBadgeVisible] = useState(initialBadgeVisible)
  const [nameDisplay, setNameDisplay] = useState<PublicVerifiedNameDisplay>(initialNameDisplay)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function handleUpdateDisplayPreferences() {
    setErrorMessage(null)
    setSuccessMessage(null)
    await runWithLoadingId('update-preferences', async () => {
      try {
        await updateMyIdentityVerificationDisplayPreferences({
          verified_badge_visible: badgeVisible,
          public_verified_name_display: nameDisplay,
        })
        onSuccess(
          t(
            'extracted.identityVerification.verifiedDisplayPreferencesCard.displayPreferencesSaved_1a62a267',
          ),
        )
        setSuccessMessage(
          t(
            'extracted.identityVerification.verifiedDisplayPreferencesCard.displayPreferencesSaved_1a62a267',
          ),
        )
      } catch (error) {
        setErrorMessage(
          onError(error, {
            fallback: t(
              'extracted.identityVerification.verifiedDisplayPreferencesCard.failedToUpdateDisplayPreferences_3610edcd',
            ),
            tags: { form: 'identity-verification-display-preferences' },
          }),
        )
      }
    })
  }

  return (
    <Card className='p-4 space-y-4'>
      <div>
        <h2 className='mb-1 text-lg font-semibold'>
          {t('extracted.identityVerification.verifiedDisplayPreferencesCard.verified_4f783840')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.identityVerification.verifiedDisplayPreferencesCard.yourIdentityHasBeenVerifiedYou_f16822f1',
          )}
        </p>
      </div>
      <div className='flex items-center gap-3'>
        <Switch
          id='badge-visible'
          checked={badgeVisible}
          onCheckedChange={setBadgeVisible}
          data-pw='badge-visible-toggle'
        />
        <Label htmlFor='badge-visible'>
          {t(
            'extracted.identityVerification.verifiedDisplayPreferencesCard.showVerifiedBadgeOnProfile_6f80b7c8',
          )}
        </Label>
      </div>
      <div className='space-y-1'>
        <Label htmlFor='name-display'>
          {t(
            'extracted.identityVerification.verifiedDisplayPreferencesCard.publicNameDisplay_f9af4a25',
          )}
        </Label>
        <Select
          value={nameDisplay}
          onValueChange={v => setNameDisplay(v as PublicVerifiedNameDisplay)}
        >
          <SelectTrigger
            id='name-display'
            data-pw='name-display-select'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='hidden'>
              {t('extracted.identityVerification.verifiedDisplayPreferencesCard.hidden_7e6fefff')}
            </SelectItem>
            <SelectItem value='first_name'>
              {t(
                'extracted.identityVerification.verifiedDisplayPreferencesCard.firstNameOnly_6c53ebcf',
              )}
            </SelectItem>
            <SelectItem
              value='first_name_last_initial'
              data-pw='name-display-option-first-name-last-initial'
            >
              {t(
                'extracted.identityVerification.verifiedDisplayPreferencesCard.firstNameLastInitial_f4a256d5',
              )}
            </SelectItem>
            <SelectItem value='full_name'>
              {t('extracted.identityVerification.verifiedDisplayPreferencesCard.fullName_f13a64ba')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {errorMessage && <p className='text-sm text-destructive'>{errorMessage}</p>}
      {successMessage && (
        <p
          className='text-sm text-green-600'
          data-pw='identity-display-preferences-success'
        >
          {successMessage}
        </p>
      )}
      <Button
        data-pw='save-preferences-button'
        onClick={handleUpdateDisplayPreferences}
        loading={loadingIds.has('update-preferences')}
        disabled={loadingIds.has('update-preferences')}
      >
        {loadingIds.has('update-preferences')
          ? t('extracted.identityVerification.verifiedDisplayPreferencesCard.saving_3f4a5b6c')
          : t(
              'extracted.identityVerification.verifiedDisplayPreferencesCard.savePreferences_7d8e9f0a',
            )}
      </Button>
    </Card>
  )
}
