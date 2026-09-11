'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SlugAvailability } from '@/components/shared/slug-availability'
import type { useAvailabilityCheck } from '@/hooks/use-availability-check'
import { useTranslations } from '@/lib/i18n/use-translations'

type Availability = ReturnType<typeof useAvailabilityCheck>

interface Props {
  name: string
  slug: string
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSlugChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  nameAvailability: Availability
  slugAvailability: Availability
}

/** Name + slug inputs for the admin Create Topic form, with on-blur availability checks. */
export function CreateTopicIdentityFields({
  name,
  slug,
  onNameChange,
  onSlugChange,
  nameAvailability,
  slugAvailability,
}: Props) {
  const t = useTranslations()
  return (
    <>
      <div>
        <Label htmlFor='name'>
          {t('extracted.topics.createTopicIdentityFields.name_dcd1d522')}
        </Label>
        <Input
          type='text'
          id='name'
          name='name'
          data-pw='create-topic-name-input'
          required
          placeholder={t('extracted.topics.createTopicIdentityFields.eGThePointsGuy_946bec39')}
          className='mt-1'
          value={name}
          onChange={onNameChange}
          onBlur={() => nameAvailability.onBlur(name)}
        />
        <SlugAvailability
          kind='topic-name'
          state={nameAvailability.state}
        />
      </div>

      <div>
        <Label htmlFor='slug'>
          {t('extracted.topics.createTopicIdentityFields.slug_d15387ec')}
        </Label>
        <Input
          type='text'
          id='slug'
          name='slug'
          data-pw='create-topic-slug-input'
          required
          placeholder={t('extracted.topics.createTopicIdentityFields.myTopicSlug_c81db5be')}
          className='mt-1'
          value={slug}
          onChange={onSlugChange}
          onBlur={() => slugAvailability.onBlur(slug)}
        />
        <SlugAvailability
          kind='topic-slug'
          state={slugAvailability.state}
        />
      </div>
    </>
  )
}
