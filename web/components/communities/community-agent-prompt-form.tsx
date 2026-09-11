'use client'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createCommunityAgentPrompt } from '@/lib/api/client/community-agent-prompts'
import onError, { onSuccess } from '@/lib/on-error'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  communitySlug: string
}

export function CommunityAgentPromptForm({ communitySlug }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isPending, startPending] = useTransition()
  const [isRefreshing, startRefreshing] = useTransition()

  async function handleSubmit() {
    if (prompt.trim().length === 0) {
      setValidationError(
        t('extracted.communities.communityAgentPromptForm.promptIsRequired_f7f8a443'),
      )
      return
    }
    if (prompt.length > 10_000) {
      setValidationError(
        t('extracted.communities.communityAgentPromptForm.promptMust10000CharactersOr_75c1685f'),
      )
      return
    }
    setValidationError(null)
    startPending(async () => {
      try {
        await createCommunityAgentPrompt(communitySlug, { prompt })
        setPrompt('')
        onSuccess(t('extracted.communities.communityAgentPromptForm.promptCreated_8ce11e7a'))
        startRefreshing(() => router.refresh())
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.communities.communityAgentPromptForm.failedToCreatePrompt_fdf3ab4f',
          ),
        })
      }
    })
  }

  const disabled = isPending || isRefreshing

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        void handleSubmit()
      }}
      data-pw='community-agent-prompt-form'
      className='space-y-2'
    >
      <Textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder={t(
          'extracted.communities.communityAgentPromptForm.enterAgentPromptText110_04bb33f8',
        )}
        rows={4}
        disabled={disabled}
        aria-label={t('extracted.communities.communityAgentPromptForm.newAgentPrompt_88efd7a8')}
      />
      {validationError ? <p className='text-sm text-destructive'>{validationError}</p> : null}
      <Button
        type='submit'
        size='touch'
        disabled={disabled}
      >
        {isPending
          ? t('extracted.communities.communityAgentPromptForm.creating_c79ed949')
          : t('extracted.communities.communityAgentPromptForm.createPrompt_b05071bf')}
      </Button>
    </form>
  )
}
