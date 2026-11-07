'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createCommunity } from '@/lib/api/client'
import { ApiError } from '@vouchington/api-client'
import { communityHref } from '@/lib/links/entity-href'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { UsernameRequiredDialog } from '@/components/shared/username-required-dialog'
import { useAvailabilityCheck } from '@/hooks/use-availability-check'
import { countWords } from '@ts-shared/utils/text-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'
import { CreateCommunityDetailsFields } from './create-community-details-fields'

export function CreateCommunityForm() {
  const t = useTranslations()
  const { push } = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [allowMemberInvites, setAllowMemberInvites] = useState(true)
  const turnstile = useTurnstileToken('communities.create')

  const nameWordCount = countWords(name)
  const nameTooShort = name.length > 0 && nameWordCount < 3
  const slugAvailability = useAvailabilityCheck('community-slug')

  async function submitCreate() {
    try {
      const result = await createCommunity({
        name,
        slug: slug || undefined,
        markdown: markdown || undefined,
        visibility,
        member_invites_allowed_at: allowMemberInvites,
        cf_turnstile_response: turnstile.token ?? undefined,
      })
      window.dispatchEvent(new CustomEvent('communities:created', { detail: result.community }))
      push(communityHref(result.community))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'IDENTITY_REQUIRED') {
        // The username gate runs before captcha verification on the backend, so the
        // token is still unconsumed — keep it for the post-username retry.
        setUsernameDialogOpen(true)
      } else {
        // The token was consumed by the backend's verification; get a fresh one.
        turnstile.reset()
        setError(
          err instanceof Error
            ? err.message
            : t('extracted.communities.createCommunityForm.failedToCreateCommunity_fc11ae3b'),
        )
        setLoading(false)
      }
    }
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

    setError(null)
    setLoading(true)
    await submitCreate()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-6'
    >
      {error && (
        <div
          role='alert'
          className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'
        >
          {error}
        </div>
      )}

      <CreateCommunityDetailsFields
        allowMemberInvites={allowMemberInvites}
        markdown={markdown}
        name={name}
        nameTooShort={nameTooShort}
        setAllowMemberInvites={setAllowMemberInvites}
        setMarkdown={setMarkdown}
        setName={setName}
        setSlug={setSlug}
        setVisibility={setVisibility}
        slug={slug}
        slugAvailability={slugAvailability}
        visibility={visibility}
      />

      <p className='text-xs text-muted-foreground'>
        {t('extracted.communities.createCommunityForm.newCommunitiesCanHostMemberPosts_43645b9d')}
      </p>

      <TurnstileField turnstile={turnstile} />

      <Button
        type='submit'
        loading={loading}
        disabled={loading || !name || nameWordCount < 3 || !turnstile.token}
        data-pw='create-community-submit-button'
      >
        {loading
          ? t('extracted.communities.createCommunityForm.creating_def70944')
          : t('extracted.communities.createCommunityForm.createCommunity_62cdc055')}
      </Button>

      <UsernameRequiredDialog
        open={usernameDialogOpen}
        title={t('extracted.communities.createCommunityForm.createAUsernameToCreateA_60becdca')}
        description={t(
          'extracted.communities.createCommunityForm.aUsernameIsRequiredToCreate_ffdd9ff1',
        )}
        submitLabel={t(
          'extracted.communities.createCommunityForm.createUsernameCommunity_137dbf29',
        )}
        onUsernameSet={() => {
          setUsernameDialogOpen(false)
          void submitCreate()
        }}
        onClose={() => {
          setUsernameDialogOpen(false)
          setLoading(false)
        }}
      />
    </form>
  )
}
