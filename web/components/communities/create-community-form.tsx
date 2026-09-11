/* oxlint-disable max-lines -- multi-field create form already at the ceiling; required Turnstile bot-protection wiring pushes it just over */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createCommunity } from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'
import { communityHref } from '@/lib/links/entity-href'
import { TurnstileField } from '@/components/shared/turnstile-field'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { UsernameRequiredDialog } from '@/components/shared/username-required-dialog'
import { SlugAvailability } from '@/components/shared/slug-availability'
import { useAvailabilityCheck } from '@/hooks/use-availability-check'
import { countWords } from '@ts-shared/utils/text-metrics'
import { useTranslations } from '@/lib/i18n/use-translations'

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
  const turnstile = useTurnstileToken()

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
    } catch (error) {
      if (error instanceof ApiError && error.code === 'IDENTITY_REQUIRED') {
        // The username gate runs before captcha verification on the backend, so the
        // token is still unconsumed — keep it for the post-username retry.
        setUsernameDialogOpen(true)
      } else {
        // The token was consumed by the backend's verification; get a fresh one.
        turnstile.reset()
        setError(
          error instanceof Error
            ? error.message
            : t('extracted.communities.createCommunityForm.failedToCreateCommunity_fc11ae3b'),
        )
        setLoading(false)
      }
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
        <div className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>{error}</div>
      )}

      <div className='space-y-2'>
        <Label htmlFor='name'>
          {t('extracted.communities.createCommunityForm.communityName_f7e0dd3f')}
        </Label>
        <Input
          id='name'
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('extracted.communities.createCommunityForm.myAwesomeCommunity_1ede3c3e')}
          required
          data-pw='create-community-name-input'
        />
        {nameTooShort && (
          <p
            className='text-xs text-destructive'
            data-pw='create-community-name-error'
          >
            {t('extracted.communities.createCommunityForm.communityNameMustHaveAtLeast_f99bb432')}
          </p>
        )}
      </div>

      <div className='space-y-2'>
        <Label htmlFor='slug'>{t('extracted.communities.createCommunityForm.slug_d15387ec')}</Label>
        <Input
          id='slug'
          value={slug}
          onChange={e => {
            setSlug(e.target.value)
            slugAvailability.reset()
          }}
          onBlur={() => {
            if (slug) slugAvailability.onBlur(slug)
          }}
          placeholder={t('extracted.communities.createCommunityForm.myAwesomeCommunity_83104213')}
          data-pw='create-community-slug-input'
        />
        <p className='text-xs text-muted-foreground'>
          {t('extracted.communities.createCommunityForm.leaveBlankToAutoGenerateA_a525a32b')}
        </p>
        <SlugAvailability
          kind='community-slug'
          state={slugAvailability.state}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='markdown'>
          {t('extracted.communities.createCommunityForm.description_526e0087')}
        </Label>
        <Textarea
          id='markdown'
          value={markdown}
          onChange={e => setMarkdown(e.target.value)}
          placeholder={t(
            'extracted.communities.createCommunityForm.describeYourCommunity_39db0382',
          )}
          rows={4}
          data-pw='create-community-description-textarea'
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='visibility'>
          {t('extracted.communities.createCommunityForm.visibility_7448611d')}
        </Label>
        <Select
          value={visibility}
          onValueChange={v => setVisibility(v as 'public' | 'private')}
        >
          <SelectTrigger id='visibility'>
            <SelectValue
              placeholder={t('extracted.communities.createCommunityForm.selectVisibility_50cfa8c8')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='public'>
              {t('extracted.communities.createCommunityForm.publicAnyoneCanJoin_e148a075')}
            </SelectItem>
            <SelectItem value='private'>
              {t(
                'extracted.communities.createCommunityForm.privateInviteOrApprovalRequired_3f4adbfa',
              )}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-3'>
        <Label>{t('extracted.communities.createCommunityForm.options_d0db8b5e')}</Label>
        <div className='space-y-3'>
          <div className='flex items-center gap-2'>
            <Checkbox
              id='allow-member-invites'
              checked={allowMemberInvites}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                setAllowMemberInvites(checked === true)
              }
            />
            <Label
              htmlFor='allow-member-invites'
              className='cursor-pointer font-normal'
            >
              {t('extracted.communities.createCommunityForm.allowMembersToInviteOthers_a4ec6be5')}
            </Label>
          </div>
        </div>
      </div>

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
