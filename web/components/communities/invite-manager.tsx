'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState } from '@/components/shared/empty-state'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InviteItem } from './invite-item'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { sendInvite, revokeInvite } from '@/lib/api/client'
import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { CommunityInvitesResponseBody } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface InviteManagerProps {
  data: CommunityInvitesResponseBody
  communitySlug: string
}

export function InviteManager({ data, communitySlug }: InviteManagerProps) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const endpoint = `/api/v1/communities/${encodeURIComponent(communitySlug)}/invites`
  const { pages, hasNextPage, endCursor, loadMore, loadingMore, fetchError, clearError, resetKey } =
    usePaginatedList(data, endpoint, {})
  const results = mergePageResultsById(pages)
  const communityInvites = mergeRecords(pages, page => page.community_invites)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [revokedInviteIds, setRevokedInviteIds] = useState<ReadonlySet<string>>(() => new Set())

  const invites = results.flatMap(result => {
    const invite = communityInvites[result.id]
    return invite && !revokedInviteIds.has(invite.id) ? [invite] : []
  })

  async function handleSendInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSendLoading(true)
    try {
      await sendInvite(communitySlug, {
        email: email || undefined,
        username: username || undefined,
      })
      setEmail('')
      setUsername('')
      refresh()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t('extracted.communities.inviteManager.failedToSendInvite_f14597da'),
      )
    } finally {
      setSendLoading(false)
    }
  }

  async function handleRevoke(inviteId: string) {
    setError(null)
    setLoading(inviteId)
    try {
      await revokeInvite(communitySlug, inviteId)
      setRevokedInviteIds(current => new Set(current).add(inviteId))
      refresh()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t('extracted.communities.inviteManager.failedToRevokeInvite_ac674f0b'),
      )
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className='space-y-8'>
      <div className='rounded-md border bg-card p-6'>
        <h2 className='mb-4 text-lg font-semibold'>
          {t('extracted.communities.inviteManager.sendInvite_c1ad5dcf')}
        </h2>
        {error && (
          <div className='mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive'>
            {error}
          </div>
        )}
        <form
          onSubmit={handleSendInvite}
          className='space-y-4'
        >
          <div className='space-y-2'>
            <Label htmlFor='invite-email'>
              {t('extracted.communities.inviteManager.emailAddress_f2488fd4')}
            </Label>
            <Input
              id='invite-email'
              type='email'
              value={email}
              onChange={e => {
                setEmail(e.target.value)
                if (e.target.value) setUsername('')
              }}
              placeholder={t('extracted.communities.inviteManager.userExampleCom_b4c9a289')}
              data-pw='community-invites-email-input'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='invite-username'>
              {t('extracted.communities.inviteManager.orUsername_0cb007f9')}
            </Label>
            <Input
              id='invite-username'
              value={username}
              onChange={e => {
                setUsername(e.target.value)
                if (e.target.value) setEmail('')
              }}
              placeholder={t('extracted.communities.inviteManager.username_98f84095')}
            />
          </div>
          <Button
            type='submit'
            loading={sendLoading}
            disabled={sendLoading || (!email && !username)}
            data-pw='community-invites-send-button'
          >
            {sendLoading
              ? t('extracted.communities.inviteManager.sending_286a3af7')
              : t('extracted.communities.inviteManager.sendInvite_c1ad5dcf')}
          </Button>
        </form>
      </div>

      <div>
        <h2 className='mb-4 text-lg font-semibold'>
          {t('extracted.communities.inviteManager.existingInvites_cd3b70b6')}
        </h2>
        {invites.length === 0 && !hasNextPage ? (
          <EmptyState
            icon='inbox'
            title={t('extracted.communities.inviteManager.noInvitesSentYet_a4946f76')}
            description={t('extracted.communities.inviteManager.useTheFormAboveToInvite_59a67720')}
            className='rounded-md border bg-card p-4'
          />
        ) : (
          <InfiniteScroll
            hasNextPage={hasNextPage}
            endCursor={endCursor}
            onLoadMore={loadMore}
            loadingMore={loadingMore}
            fetchError={fetchError}
            clearError={clearError}
            resetKey={resetKey}
          >
            <div className='space-y-3'>
              {invites.map(invite => (
                <InviteItem
                  key={invite.id}
                  invite={invite}
                  loading={loading === invite.id}
                  onRevoke={handleRevoke}
                />
              ))}
            </div>
          </InfiniteScroll>
        )}
      </div>
    </div>
  )
}
