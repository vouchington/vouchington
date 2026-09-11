'use client'
import { useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { Button } from '@/components/ui/button'
import {
  createMyProfileLink,
  deleteMyProfileLink,
  reorderMyProfileLinks,
  updateMyProfileLink,
} from '@/lib/api/client'
import { ProfileLinkForm } from './profile-link-form'
import { ProfileLinkRow } from './profile-link-row'
import type { ProfileLink, ProfileLinkType } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'
interface Props {
  initialLinks: ProfileLink[]
}
export function ProfileLinks({ initialLinks }: Props) {
  const t = useTranslations()
  const [links, setLinks] = useState(initialLinks)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  async function handleCreate(data: {
    link_type: ProfileLinkType
    url?: string
    handle?: string
    name?: string
  }) {
    setLoading(true)
    try {
      const { profile_link: link } = await createMyProfileLink(data)
      setLinks(prev => [...prev, link])
      setShowAddForm(false)
      onSuccess(t('extracted.my.profileLinks.profileLinkAdded_f8ee6d85'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.profileLinks.failedToAddLink_eb8d49b3'),
        tags: { form: 'my-profile-links' },
      })
    } finally {
      setLoading(false)
    }
  }
  async function handleUpdate(
    linkId: string,
    data: { url?: string; handle?: string; name?: string },
  ) {
    setLoading(true)
    try {
      const { profile_link: updated } = await updateMyProfileLink(linkId, data)
      setLinks(prev => prev.map(l => (l.id === linkId ? updated : l)))
      setEditingId(null)
      onSuccess(t('extracted.my.profileLinks.profileLinkUpdated_77ed45b7'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.profileLinks.failedToUpdateLink_9a4cc50c'),
        tags: { form: 'my-profile-links' },
      })
    } finally {
      setLoading(false)
    }
  }
  async function handleDelete(linkId: string) {
    setLoading(true)
    try {
      await deleteMyProfileLink(linkId)
      setLinks(prev => prev.filter(l => l.id !== linkId))
      onSuccess(t('extracted.my.profileLinks.profileLinkRemoved_ee75df75'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.profileLinks.failedToRemoveLink_dadf1223'),
        tags: { form: 'my-profile-links' },
      })
    } finally {
      setLoading(false)
    }
  }
  async function handleMoveUp(index: number) {
    if (index === 0) return
    const prevLinks = links
    const newLinks = [...links]
    const moved = newLinks.splice(index, 1)[0]!
    newLinks.splice(index - 1, 0, moved)
    setLinks(newLinks)
    await saveOrder(newLinks, prevLinks)
  }
  async function handleMoveDown(index: number) {
    if (index === links.length - 1) return
    const prevLinks = links
    const newLinks = [...links]
    const moved = newLinks.splice(index, 1)[0]!
    newLinks.splice(index + 1, 0, moved)
    setLinks(newLinks)
    await saveOrder(newLinks, prevLinks)
  }
  async function saveOrder(orderedLinks: ProfileLink[], prevLinks: ProfileLink[]) {
    setLoading(true)
    try {
      await reorderMyProfileLinks({
        ids: orderedLinks.map(l => l.id),
      })
    } catch (error) {
      setLinks(prevLinks)
      onError(error, {
        fallback: t('extracted.my.profileLinks.failedToReorderLinks_2ba22b75'),
        tags: { form: 'my-profile-links' },
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='space-y-4'>
      <h2 className='text-lg font-semibold'>
        {t('extracted.my.profileLinks.profileLinks_38ab5b4c')}
      </h2>

      {links.length === 0 && !showAddForm && (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.my.profileLinks.noLinksYetAddYourFirst_caa3663f')}
        </p>
      )}

      <ul className='space-y-2'>
        {links.map((link, index) => (
          <li key={link.id}>
            {editingId === link.id ? (
              <ProfileLinkForm
                link={link}
                onSubmit={data => handleUpdate(link.id, data)}
                onCancel={() => setEditingId(null)}
                loading={loading}
              />
            ) : (
              <ProfileLinkRow
                link={link}
                loading={loading}
                canMoveUp={index > 0}
                canMoveDown={index < links.length - 1}
                onMoveUp={() => handleMoveUp(index)}
                onMoveDown={() => handleMoveDown(index)}
                onEdit={() => setEditingId(link.id)}
                onDelete={() => handleDelete(link.id)}
              />
            )}
          </li>
        ))}
      </ul>

      {showAddForm ? (
        <ProfileLinkForm
          onSubmit={handleCreate}
          onCancel={() => setShowAddForm(false)}
          loading={loading}
        />
      ) : (
        <Button
          variant='outline'
          onClick={() => setShowAddForm(true)}
        >
          {t('extracted.my.profileLinks.addLink_dfe9ca4d')}
        </Button>
      )}
    </div>
  )
}
