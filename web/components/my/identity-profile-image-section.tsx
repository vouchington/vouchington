'use client'

import { Button } from '@/components/ui/button'
import { ImageUploadButton } from '@/components/shared/image-upload-button'
import { UserAvatar } from '@/components/shared/user-avatar'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ImagePlacementTuple } from '@/types/user'

interface IdentityProfileImageSectionProps {
  handleImageUploadEnd: () => void
  handleImageUploadStart: () => void
  handleImageUploaded: (imageId: string) => Promise<void>
  handleRemoveImage: () => Promise<void>
  imageLoading: boolean
  profileImageId: string | null
  profileImagePlacement?: ImagePlacementTuple | null
  username: string
}

export function IdentityProfileImageSection({
  handleImageUploadEnd,
  handleImageUploadStart,
  handleImageUploaded,
  handleRemoveImage,
  imageLoading,
  profileImageId,
  profileImagePlacement,
  username,
}: IdentityProfileImageSectionProps) {
  const t = useTranslations()
  return (
    <div>
      <h2
        className='text-lg font-semibold'
        data-pw='identity-profile-image-heading'
      >
        {t('extracted.my.identityProfileImageSection.profileImage_3f539deb')}
      </h2>
      <div className='mt-3 space-y-3'>
        <div className='flex items-center gap-4'>
          <UserAvatar
            profileImageId={profileImageId}
            profileImagePlacement={profileImagePlacement}
            username={username}
            size='lg'
          />
          <div className='flex gap-2'>
            <ImageUploadButton
              onUploaded={handleImageUploaded}
              onUploadStart={handleImageUploadStart}
              onUploadEnd={handleImageUploadEnd}
              disabled={imageLoading}
              label={profileImageId ? 'Change image' : 'Upload image'}
              data-pw='identity-profile-image-upload'
            />
            {profileImageId && (
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={handleRemoveImage}
                disabled={imageLoading}
                data-pw='identity-profile-image-remove'
              >
                {t('extracted.my.identityProfileImageSection.removeImage_da7acac1')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
