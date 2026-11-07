'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { applyToCommunity } from '@/lib/api/client'
import { createCommunityPathname } from '@/lib/links/entity-href'
import type { CommunityApplicationQuestion } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ApplicationQuestionFields } from './application-question-fields'

interface ApplicationFormProps {
  communitySlug: string
  questions: CommunityApplicationQuestion[]
}

export function ApplicationForm({ communitySlug, questions }: ApplicationFormProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [message, setMessage] = useState('')

  function setAnswer(questionId: string, value: unknown) {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

    setError(null)
    setLoading(true)
    try {
      await applyToCommunity(communitySlug, answers, message || undefined)
      push(createCommunityPathname(communitySlug))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('extracted.communities.applicationForm.failedToSubmitApplication_f7750bae'),
      )
      setLoading(false)
    }
  }

  if (questions.length === 0) {
    return (
      <form
        onSubmit={handleSubmit}
        className='space-y-4'
      >
        <div className='space-y-2'>
          <Label htmlFor='application-message'>
            {t('extracted.communities.applicationForm.messageOptional_0a411b50')}
          </Label>
          <Textarea
            id='application-message'
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder={t('extracted.communities.applicationForm.tellUsWhyYouWantTo_85c411ba')}
          />
        </div>
        {error && (
          <div className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>{error}</div>
        )}
        <Button
          data-pw='application-form-apply-to-join'
          type='submit'
          loading={loading}
          disabled={loading}
        >
          {loading
            ? t('extracted.communities.applicationForm.submitting_64115d5b')
            : t('extracted.communities.applicationForm.applyToJoin_8e81ad87')}
        </Button>
      </form>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-6'
    >
      {error && (
        <div className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>{error}</div>
      )}

      <ApplicationQuestionFields
        answers={answers}
        questions={questions}
        setAnswer={setAnswer}
      />

      <div className='space-y-2'>
        <Label htmlFor='application-message'>
          {t('extracted.communities.applicationForm.messageOptional_0a411b50')}
        </Label>
        <Textarea
          id='application-message'
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder={t(
            'extracted.communities.applicationForm.anythingElseYouWouldLikeTo_b7565a0d',
          )}
        />
      </div>

      <Button
        data-pw='application-form-submit-application'
        type='submit'
        loading={loading}
        disabled={loading}
      >
        {loading
          ? t('extracted.communities.applicationForm.submitting_64115d5b')
          : t('extracted.communities.applicationForm.submitApplication_dc5ad37a')}
      </Button>
    </form>
  )
}
