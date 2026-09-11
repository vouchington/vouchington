/* eslint-disable max-lines -- Application form supports multiple question types and message field, requiring extended length. */
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
import { applyToCommunity } from '@/lib/api/client'
import { createCommunityPathname } from '@/lib/links/entity-href'
import type { CommunityApplicationQuestion } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

    setError(null)
    setLoading(true)
    try {
      await applyToCommunity(communitySlug, answers, message || undefined)
      push(createCommunityPathname(communitySlug))
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
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

      {questions.map(question => (
        <div
          key={question.id}
          className='space-y-2'
        >
          <Label htmlFor={question.id}>
            {question.question}
            {question.required && (
              <span className='ml-1 text-destructive'>
                {t('extracted.communities.applicationForm.text_684888c0')}
              </span>
            )}
          </Label>

          {question.field_type === 'short_text' && (
            <Input
              id={question.id}
              value={(answers[question.id] as string) ?? ''}
              onChange={e => setAnswer(question.id, e.target.value)}
              placeholder={t('extracted.communities.applicationForm.yourAnswer_d0e869b7')}
              required={question.required}
            />
          )}

          {question.field_type === 'long_text' && (
            <Textarea
              id={question.id}
              value={(answers[question.id] as string) ?? ''}
              onChange={e => setAnswer(question.id, e.target.value)}
              rows={4}
              placeholder={t('extracted.communities.applicationForm.writeYourAnswer_10a15f8f')}
              required={question.required}
            />
          )}

          {question.field_type === 'single_select' && question.options && (
            <Select
              value={(answers[question.id] as string) ?? ''}
              onValueChange={v => setAnswer(question.id, v)}
            >
              <SelectTrigger id={question.id}>
                <SelectValue
                  placeholder={t('extracted.communities.applicationForm.selectAnOption_45701e82')}
                />
              </SelectTrigger>
              <SelectContent>
                {question.options.map(option => (
                  <SelectItem
                    key={option}
                    value={option}
                  >
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {question.field_type === 'multi_select' && question.options && (
            <div className='space-y-2'>
              {question.options.map(option => {
                const selected = ((answers[question.id] as string[]) ?? []).includes(option)
                return (
                  <div
                    key={option}
                    className='flex items-center gap-2'
                  >
                    <Checkbox
                      id={`${question.id}-${option}`}
                      checked={selected}
                      onCheckedChange={(checked: boolean | 'indeterminate') => {
                        const current = (answers[question.id] as string[]) ?? []
                        setAnswer(
                          question.id,
                          checked ? [...current, option] : current.filter(v => v !== option),
                        )
                      }}
                    />
                    <Label
                      htmlFor={`${question.id}-${option}`}
                      className='cursor-pointer font-normal'
                    >
                      {option}
                    </Label>
                  </div>
                )
              })}
            </div>
          )}

          {question.field_type === 'checkbox' && (
            <div className='flex items-center gap-2'>
              <Checkbox
                id={question.id}
                checked={(answers[question.id] as boolean) ?? false}
                onCheckedChange={(checked: boolean | 'indeterminate') =>
                  setAnswer(question.id, checked === true)
                }
              />
              <Label
                htmlFor={question.id}
                className='cursor-pointer font-normal'
              >
                {t('extracted.communities.applicationForm.yes_85a39ab3')}
              </Label>
            </div>
          )}
        </div>
      ))}

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
