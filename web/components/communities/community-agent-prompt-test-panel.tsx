'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  simulateCommunityAutomod,
  type CommunityAgentPrompt,
  type CommunityAutomodSimulation,
} from '@/lib/api/client/community-agent-prompts'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import onError from '@/lib/on-error'
import { useState, useTransition } from 'react'
import { CommunityAgentPromptTestResults } from './community-agent-prompt-test-results'
import { useTranslations } from '@/lib/i18n/use-translations'

type Props = { prompt: CommunityAgentPrompt; communitySlug: string }

const WINDOW_OPTIONS = [
  {
    value: '24',
    messageKey: 'extracted.communities.communityAgentPromptTestPanel.24Hours_f0514e8d',
  },
  {
    value: '168',
    messageKey: 'extracted.communities.communityAgentPromptTestPanel.7Days_7f920bb6',
  },
  {
    value: '720',
    messageKey: 'extracted.communities.communityAgentPromptTestPanel.30Days_ffd72805',
  },
] as const

export function CommunityAgentPromptTestPanel({ prompt, communitySlug }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const [promptTextDraft, setPromptTextDraft] = useState<string | null>(null)
  const [timeWindowHours, setTimeWindowHours] = useState('168')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [simulation, setSimulation] = useState<CommunityAutomodSimulation | null>(null)
  const [isPending, startPending] = useTransition()
  const promptText = promptTextDraft ?? prompt.prompt
  const flaggedResults = simulation?.results.filter(result => result.flagged) ?? []

  function handlePromptTextChange(value: string) {
    setPromptTextDraft(value)
    setSimulation(null)
  }

  function handleTimeWindowChange(value: string) {
    setTimeWindowHours(value)
    setSimulation(null)
  }

  function handleRun() {
    const trimmedPrompt = promptText.trim()
    if (!trimmedPrompt) {
      setValidationError(
        t('extracted.communities.communityAgentPromptTestPanel.promptIsRequired_f7f8a443'),
      )
      return
    }
    if (promptText.length > 10_000) {
      setValidationError(
        t(
          'extracted.communities.communityAgentPromptTestPanel.promptMustBe10000Characters_75c1685f',
        ),
      )
      return
    }
    setValidationError(null)
    startPending(async () => {
      try {
        const response = await simulateCommunityAutomod(communitySlug, {
          prompt_id: prompt.id,
          prompt: trimmedPrompt === prompt.prompt.trim() ? undefined : trimmedPrompt,
          time_window_hours: Number(timeWindowHours),
          limit: 25,
        })
        setSimulation(response)
      } catch (error) {
        onError(error, {
          fallback: t(
            'extracted.communities.communityAgentPromptTestPanel.failedToRunSimulation_4f23a97e',
          ),
        })
      }
    })
  }

  return (
    <div
      className='border-t pt-3 space-y-3'
      data-pw='community-agent-prompt-test-panel'
    >
      <form
        className='space-y-3'
        onSubmit={event => {
          event.preventDefault()
          handleRun()
        }}
      >
        <Textarea
          value={promptText}
          onChange={event => handlePromptTextChange(event.target.value)}
          rows={4}
          disabled={isPending}
          aria-label={t(
            'extracted.communities.communityAgentPromptTestPanel.simulationPrompt_386f0a6a',
          )}
        />
        <div className='flex flex-wrap items-end gap-2'>
          <div className='w-40 space-y-1'>
            <Label
              id={`simulation-window-${prompt.id}-label`}
              htmlFor={`simulation-window-${prompt.id}`}
              className='text-xs font-medium text-muted-foreground'
            >
              {t('extracted.communities.communityAgentPromptTestPanel.sampleWindow_b06adfc5')}
            </Label>
            <Select
              value={timeWindowHours}
              onValueChange={handleTimeWindowChange}
              disabled={isPending}
            >
              <SelectTrigger id={`simulation-window-${prompt.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map(option => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                  >
                    {t(option.messageKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type='submit'
            size='touch'
            disabled={isPending}
          >
            {isPending
              ? t('extracted.communities.communityAgentPromptTestPanel.testing_6c02a284')
              : t('extracted.communities.communityAgentPromptTestPanel.runTest_f3c5e08f')}
          </Button>
        </div>
        {validationError ? <p className='text-sm text-destructive'>{validationError}</p> : null}
      </form>

      {simulation ? (
        <CommunityAgentPromptTestResults
          simulation={simulation}
          flaggedResults={flaggedResults}
          uiLocale={uiLocale}
        />
      ) : null}
    </div>
  )
}
