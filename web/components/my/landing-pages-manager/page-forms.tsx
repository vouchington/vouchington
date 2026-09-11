'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { LandingPageWithItems } from '@/types/landing-pages'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CreatePageFormProps {
  loading: boolean
  newTitle: string
  newSlug: string
  newSubtitle: string
  onSubmit: (event: React.FormEvent) => void
  setNewTitle: (value: string) => void
  setNewSlug: (value: string) => void
  setNewSubtitle: (value: string) => void
}

export function CreatePageForm({
  loading,
  newTitle,
  newSlug,
  newSubtitle,
  onSubmit,
  setNewTitle,
  setNewSlug,
  setNewSubtitle,
}: CreatePageFormProps) {
  const t = useTranslations()
  return (
    <form
      onSubmit={onSubmit}
      className='space-y-3 rounded-lg border p-4'
    >
      <h2 className='text-lg font-semibold'>
        {t('extracted.landingPagesManager.pageForms.createNewPage_f2a50371')}
      </h2>
      <div className='grid gap-3 md:grid-cols-3'>
        <TextInput
          id='new-landing-page-title'
          label={t('extracted.landingPagesManager.pageForms.title_7e8cd205')}
          value={newTitle}
          onChange={setNewTitle}
          placeholder={t('extracted.landingPagesManager.pageForms.pageTitle_02660ffe')}
        />
        <TextInput
          id='new-landing-page-slug'
          label={t('extracted.landingPagesManager.pageForms.slug_d15387ec')}
          value={newSlug}
          onChange={setNewSlug}
          placeholder={t('extracted.landingPagesManager.pageForms.slug_cd03861f')}
        />
        <TextInput
          id='new-landing-page-subtitle'
          label={t('extracted.landingPagesManager.pageForms.subtitle_383cd6c0')}
          value={newSubtitle}
          onChange={setNewSubtitle}
          placeholder={t('extracted.landingPagesManager.pageForms.optionalSubtitle_544e248f')}
        />
      </div>
      <Button
        type='submit'
        loading={loading}
        disabled={loading}
        data-pw='landing-pages-create-button'
      >
        {t('extracted.landingPagesManager.pageForms.createLandingPage_e5d92193')}
      </Button>
    </form>
  )
}

interface PageDetailsFormProps {
  loading: boolean
  selectedPage: LandingPageWithItems
  title: string
  slug: string
  subtitle: string
  onSubmit: (event: React.FormEvent) => void
  onSetDefault: () => void
  onDelete: () => void
  setTitle: (value: string) => void
  setSlug: (value: string) => void
  setSubtitle: (value: string) => void
}

export function PageDetailsForm({
  loading,
  selectedPage,
  title,
  slug,
  subtitle,
  onSubmit,
  onSetDefault,
  onDelete,
  setTitle,
  setSlug,
  setSubtitle,
}: PageDetailsFormProps) {
  const t = useTranslations()
  return (
    <form
      onSubmit={onSubmit}
      className='space-y-3 rounded-lg border p-4'
    >
      <div className='flex items-center justify-between gap-3'>
        <h2 className='text-lg font-semibold'>
          {t('extracted.landingPagesManager.pageForms.pageDetails_86bbe3b1')}
        </h2>
        <div className='flex gap-2'>
          {!selectedPage.is_default ? (
            <Button
              type='button'
              variant='outline'
              onClick={onSetDefault}
              disabled={loading}
            >
              {t('extracted.landingPagesManager.pageForms.makeDefault_f43b9425')}
            </Button>
          ) : null}
          <Button
            type='button'
            variant='destructive'
            onClick={onDelete}
            disabled={loading}
          >
            {t('extracted.landingPagesManager.pageForms.delete_e2d0a549')}
          </Button>
        </div>
      </div>
      <TextInput
        id='landing-page-title'
        label={t('extracted.landingPagesManager.pageForms.title_7e8cd205')}
        value={title}
        onChange={setTitle}
        placeholder={t('extracted.landingPagesManager.pageForms.pageTitle_02660ffe')}
      />
      <TextInput
        id='landing-page-slug'
        label={t('extracted.landingPagesManager.pageForms.slug_d15387ec')}
        value={slug}
        onChange={setSlug}
        placeholder={t('extracted.landingPagesManager.pageForms.pageSlug_5a1d7fb6')}
      />
      <div className='space-y-1'>
        <Label htmlFor='landing-page-subtitle'>
          {t('extracted.landingPagesManager.pageForms.subtitle_383cd6c0')}
        </Label>
        <Textarea
          id='landing-page-subtitle'
          value={subtitle}
          onChange={event => setSubtitle(event.target.value)}
          placeholder={t('extracted.landingPagesManager.pageForms.optionalSubtitle_544e248f')}
          className='min-h-24'
        />
      </div>
      <Button
        type='submit'
        loading={loading}
        disabled={loading}
      >
        {t('extracted.landingPagesManager.pageForms.savePageDetails_c382b016')}
      </Button>
    </form>
  )
}

function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
