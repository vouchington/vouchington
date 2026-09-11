'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SlugAvailability } from '@/components/shared/slug-availability'
import { useAvailabilityCheck } from '@/hooks/use-availability-check'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  /** Initial slug value from the post (for edit forms). */
  initialSlug: string
  /** Called on every change so the parent can read the final value at submit time. */
  onSlugChange: (slug: string) => void
}

export function PostSlugField({ initialSlug, onSlugChange }: Props) {
  const t = useTranslations()
  const { currentUser } = useAuth()
  const isAdmin = currentUser?.roles?.includes('administrator') ?? false
  const [slug, setSlug] = useState(initialSlug)
  const slugAvailability = useAvailabilityCheck('post-slug')

  if (!isAdmin) return null

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setSlug(value)
    onSlugChange(value)
    slugAvailability.reset()
  }

  return (
    <div className='space-y-1'>
      <Label htmlFor='post-slug'>
        {t('extracted.postForm.postSlugField.slugAdminOnly_6d879325')}
      </Label>
      <Input
        id='post-slug'
        value={slug}
        onChange={handleSlugChange}
        onBlur={() => {
          if (slug !== initialSlug) slugAvailability.onBlur(slug)
        }}
        placeholder={t('extracted.postForm.postSlugField.postSlug_dafba173')}
        data-pw='post-form-slug-input'
      />
      <SlugAvailability
        kind='post-slug'
        state={slugAvailability.state}
      />
    </div>
  )
}
