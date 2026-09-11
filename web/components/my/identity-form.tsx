'use client'

import { useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { updateMyIdentity } from '@/lib/api/client'
import { isUsernameUUID } from '@ts-shared/utils/validation-core'
import type { OAuthAccountInfo } from '@/types/user'
import type { UseDisplayNameFrom } from '@/types/my'
import { IdentityProfileImageSection } from './identity-profile-image-section'
import { IdentityDisplayNameSourceSection } from './identity-display-name-source-section'
import { IdentityUsernameSection } from './identity-username-section'
import { useAvailabilityCheck } from '@/hooks/use-availability-check'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  initialUsername: string | null
  initialProfileImageId: string | null
  initialUseDisplayNameFrom: UseDisplayNameFrom
  initialFacebookAccount: OAuthAccountInfo | null
  hasOAuthAccount: boolean
}

export function IdentityForm({
  initialUsername,
  initialProfileImageId,
  initialUseDisplayNameFrom,
  initialFacebookAccount,
  hasOAuthAccount,
}: Props) {
  const t = useTranslations()
  const [username, setUsername] = useState(initialUsername ?? '')
  const [profileImageId, setProfileImageId] = useState(initialProfileImageId)
  const [useDisplayNameFrom, setUseDisplayNameFrom] =
    useState<UseDisplayNameFrom>(initialUseDisplayNameFrom)
  const [usernameLoading, setUsernameLoading] = useState(false)
  const [imageLoading, setImageLoading] = useState(false)
  const [displayNameLoading, setDisplayNameLoading] = useState(false)
  const usernameAvailability = useAvailabilityCheck('username')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isUsernameUUID(username)) {
      onError(new Error('Username cannot be a UUID'), {
        fallback: t('extracted.my.identityForm.usernameCannotBeAUuid_b0564cf3'),
        tags: { form: 'my-identity' },
        skipSentry: true,
      })
      return
    }
    setUsernameLoading(true)
    try {
      await updateMyIdentity({ username })
      onSuccess(t('extracted.my.identityForm.usernameUpdated_89b1eb5b'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.identityForm.failedToUpdateUsername_3e743bd6'),
        tags: { form: 'my-identity' },
      })
    } finally {
      setUsernameLoading(false)
    }
  }

  async function handleRemoveImage() {
    setImageLoading(true)
    try {
      await updateMyIdentity({ profile_image_id: null })
      setProfileImageId(null)
      onSuccess(t('extracted.my.identityForm.profileImageRemoved_0324d161'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.identityForm.failedToRemoveProfileImage_f815f3cb'),
        tags: { form: 'my-identity' },
      })
    } finally {
      setImageLoading(false)
    }
  }

  async function handleDisplayNameSourceChange(value: string) {
    if (
      value !== 'username' &&
      value !== 'facebook' &&
      value !== 'x' &&
      value !== 'apple' &&
      value !== 'google' &&
      value !== 'linkedin' &&
      value !== 'microsoft'
    )
      return
    setDisplayNameLoading(true)
    try {
      await updateMyIdentity({ use_display_name_from: value })
      setUseDisplayNameFrom(value)
      onSuccess(t('extracted.my.identityForm.displayNameSourceUpdated_f4f26310'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.identityForm.failedToUpdateDisplayNameSource_d5ee52e9'),
        tags: { form: 'my-identity' },
      })
    } finally {
      setDisplayNameLoading(false)
    }
  }

  async function handleImageUploaded(imageId: string) {
    try {
      await updateMyIdentity({ profile_image_id: imageId })
      setProfileImageId(imageId)
      onSuccess(t('extracted.my.identityForm.profileImageUpdated_4f3a12a1'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.identityForm.failedToUpdateProfileImage_6fb576f7'),
        tags: { form: 'my-identity' },
      })
    }
  }

  const handleImageUploadStart = () => setImageLoading(true)
  const handleImageUploadEnd = () => setImageLoading(false)

  return (
    <div className='space-y-4'>
      <IdentityUsernameSection
        username={username}
        initialUsername={initialUsername}
        hasOAuthAccount={hasOAuthAccount}
        usernameLoading={usernameLoading}
        usernameAvailability={usernameAvailability}
        onUsernameChange={setUsername}
        onSubmit={handleSubmit}
      />

      <IdentityDisplayNameSourceSection
        initialUsername={initialUsername}
        initialFacebookAccount={initialFacebookAccount}
        useDisplayNameFrom={useDisplayNameFrom}
        displayNameLoading={displayNameLoading}
        onDisplayNameSourceChange={handleDisplayNameSourceChange}
      />

      <IdentityProfileImageSection
        handleImageUploadEnd={handleImageUploadEnd}
        handleImageUploadStart={handleImageUploadStart}
        handleImageUploaded={handleImageUploaded}
        handleRemoveImage={handleRemoveImage}
        imageLoading={imageLoading}
        profileImageId={profileImageId}
        username={username}
      />
    </div>
  )
}
