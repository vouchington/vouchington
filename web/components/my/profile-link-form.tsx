'use client'

import { useState } from 'react'
import onError from '@/lib/on-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProfileLink, ProfileLinkType } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ProfileLinkTypeSelect } from './profile-link-type-select'

interface Props {
  link?: ProfileLink
  onSubmit: (data: {
    link_type: ProfileLinkType
    url?: string
    handle?: string
    name?: string
  }) => Promise<void>
  onCancel: () => void
  loading: boolean
}

interface UIProps {
  link?: ProfileLink
  linkType: ProfileLinkType
  url: string
  handle: string
  name: string
  loading: boolean
  setLinkType: (type: ProfileLinkType) => void
  setUrl: (url: string) => void
  setHandle: (handle: string) => void
  setName: (name: string) => void
  handleSubmit: (e: React.FormEvent) => Promise<void>
  onCancel: () => void
}

function ProfileLinkFormUI({
  link,
  linkType,
  url,
  handle,
  name,
  loading,
  setLinkType,
  setUrl,
  setHandle,
  setName,
  handleSubmit,
  onCancel,
}: UIProps) {
  const t = useTranslations()
  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-3 rounded-md border p-4'
    >
      {!link && (
        <ProfileLinkTypeSelect
          value={linkType}
          onValueChange={setLinkType}
        />
      )}
      {linkType === 'url' ? (
        <div className='space-y-1'>
          <Label htmlFor='link-url'>{t('extracted.my.profileLinkForm.url_e7a241de')}</Label>
          <Input
            id='link-url'
            name='url'
            type='url'
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={t('extracted.my.profileLinkForm.httpsExampleCom_100680ad')}
            autoComplete='url'
            inputMode='url'
            spellCheck={false}
          />
        </div>
      ) : (
        <div className='space-y-1'>
          <Label htmlFor='link-handle'>
            {t('extracted.my.profileLinkForm.handleUsername_e2502184')}
          </Label>
          <Input
            id='link-handle'
            name='handle'
            value={handle}
            onChange={e => setHandle(e.target.value)}
            placeholder={t('extracted.my.profileLinkForm.yourusername_deeb7b6f')}
            autoComplete='off'
            spellCheck={false}
            autoCapitalize='none'
          />
        </div>
      )}
      <div className='space-y-1'>
        <Label htmlFor='link-name'>
          {t('extracted.my.profileLinkForm.labelOptional_7df60caf')}
        </Label>
        <Input
          id='link-name'
          name='name'
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('extracted.my.profileLinkForm.myWebsite_ef977d09')}
          autoComplete='off'
        />
      </div>

      <div className='flex gap-2'>
        <Button
          type='submit'
          loading={loading}
          disabled={loading}
        >
          {loading
            ? t('extracted.my.profileLinkForm.saving_dc85af8f')
            : link
              ? t('extracted.my.profileLinkForm.update_c1c1009d')
              : t('extracted.my.profileLinkForm.addLink_dfe9ca4d')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={onCancel}
        >
          {t('extracted.my.profileLinkForm.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}

export function ProfileLinkForm({ link, onSubmit, onCancel, loading }: Props) {
  const t = useTranslations()
  const [linkType, setLinkType] = useState<ProfileLinkType>(link?.link_type ?? 'url')
  const [url, setUrl] = useState(link?.url ?? '')
  const [handle, setHandle] = useState(link?.handle ?? '')
  const [name, setName] = useState(link?.name ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await onSubmit({
        link_type: linkType,
        ...(linkType === 'url' ? { url: url || undefined } : { handle: handle || undefined }),
        name: name || undefined,
      })
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.profileLinkForm.failedToSaveLink_ee85bd27'),
        tags: { form: 'my-profile-link-form' },
      })
    }
  }

  return (
    <ProfileLinkFormUI
      link={link}
      linkType={linkType}
      url={url}
      handle={handle}
      name={name}
      loading={loading}
      setLinkType={setLinkType}
      setUrl={setUrl}
      setHandle={setHandle}
      setName={setName}
      handleSubmit={handleSubmit}
      onCancel={onCancel}
    />
  )
}
