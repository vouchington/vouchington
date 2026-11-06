'use client'

import { Button } from '@/components/ui/button'
import { ImageUploadButton } from '@/components/shared/image-upload-button'
import { PostImage } from '@/components/shared/post-image'
import { TopicLogo } from '@/components/shared/topic-logo'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { Topic } from '@/types/topics'
import type { ImagePlacementTuple } from '@/types/user'

export function ImageSection({
  heroSaving,
  logoSaving,
  onHeroRemoved,
  onHeroUploaded,
  onLogoRemoved,
  onLogoUploaded,
  setHeroSaving,
  setLogoSaving,
  topic,
}: {
  heroSaving: boolean
  logoSaving: boolean
  onHeroRemoved: () => void
  onHeroUploaded: (imageId: string) => void
  onLogoRemoved: () => void
  onLogoUploaded: (imageId: string) => void
  setHeroSaving: (saving: boolean) => void
  setLogoSaving: (saving: boolean) => void
  topic: Topic
}) {
  const t = useTranslations()
  return (
    <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
      <h2
        className='mb-4 text-xl font-semibold text-foreground'
        data-pw='topic-images-heading'
      >
        {t('extracted.settings.imageSection.images_be7e2f20')}
      </h2>
      <div className='space-y-6'>
        <ImageRow
          disabled={logoSaving}
          imageId={topic.logo_image_id}
          placement={topic.logo_image_placement}
          kind='logo'
          label={
            topic.logo_image_id
              ? t('extracted.settings.imageSection.changeLogo_a1ab83f6')
              : t('extracted.settings.imageSection.uploadLogo_c3330082')
          }
          name={topic.name}
          removeLabel={t('extracted.settings.imageSection.removeLogo_f1c1afa4')}
          onRemove={onLogoRemoved}
          onUploaded={onLogoUploaded}
          onUploadEnd={() => setLogoSaving(false)}
          onUploadStart={() => setLogoSaving(true)}
        />
        <ImageRow
          disabled={heroSaving}
          imageId={topic.hero_image_id}
          placement={topic.hero_image_placement}
          kind='hero'
          label={
            topic.hero_image_id
              ? t('extracted.settings.imageSection.changeHero_b70163bc')
              : t('extracted.settings.imageSection.uploadHero_5e79e046')
          }
          name={topic.name}
          removeLabel={t('extracted.settings.imageSection.removeHero_2aba9677')}
          onRemove={onHeroRemoved}
          onUploaded={onHeroUploaded}
          onUploadEnd={() => setHeroSaving(false)}
          onUploadStart={() => setHeroSaving(true)}
          topAligned
        />
      </div>
    </section>
  )
}

function ImageRow({
  disabled,
  imageId,
  placement,
  kind,
  label,
  name,
  onRemove,
  onUploadEnd,
  onUploadStart,
  onUploaded,
  removeLabel,
  topAligned = false,
}: {
  disabled: boolean
  imageId: string | null
  placement?: ImagePlacementTuple | null
  kind: 'hero' | 'logo'
  label: string
  name: string
  onRemove: () => void
  onUploadEnd: () => void
  onUploadStart: () => void
  onUploaded: (imageId: string) => void
  removeLabel: string
  topAligned?: boolean
}) {
  const t = useTranslations()
  return (
    <div className='space-y-2'>
      <p className='block text-sm font-medium text-foreground'>
        {label.includes('logo')
          ? t('extracted.settings.imageSection.logoImage_70100b52')
          : t('extracted.settings.imageSection.heroImage_283772ae')}
      </p>
      <div className={`flex gap-4 ${topAligned ? 'items-start' : 'items-center'}`}>
        {imageId && kind === 'logo' && (
          <div data-pw='logo-image-preview'>
            <ImagePreview
              imageId={imageId}
              placement={placement}
              kind='logo'
              name={name}
            />
          </div>
        )}
        {imageId && kind === 'hero' && (
          <div data-pw='hero-image-preview'>
            <ImagePreview
              imageId={imageId}
              placement={placement}
              kind='hero'
              name={name}
            />
          </div>
        )}
        <div className='flex gap-2'>
          <ImageUploadButton
            onUploaded={onUploaded}
            onUploadStart={onUploadStart}
            onUploadEnd={onUploadEnd}
            disabled={disabled}
            label={label}
            // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
            data-pw={`topic-image-${kind}-upload`}
          />
          {imageId && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={disabled}
              onClick={onRemove}
              // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
              data-pw={`topic-image-${kind}-remove`}
            >
              {removeLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ImagePreview({
  imageId,
  placement,
  kind,
  name,
}: {
  imageId: string
  placement?: ImagePlacementTuple | null
  kind: 'hero' | 'logo'
  name: string
}) {
  const t = useTranslations()
  if (kind === 'logo') {
    return (
      <TopicLogo
        placement={placement}
        name={name}
      />
    )
  }

  if (!placement) return null

  return (
    <PostImage
      imageId={imageId}
      placement={{ id: placement.placement_id, revision: placement.placement_revision }}
      width={400}
      height={96}
      alt={t('extracted.settings.imageSection.hero_72a9345f')}
      className='rounded-md object-cover'
    />
  )
}
