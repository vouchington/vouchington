'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { CommunityApplicationQuestion } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ApplicationQuestionFieldsProps {
  answers: Record<string, unknown>
  questions: CommunityApplicationQuestion[]
  setAnswer: (questionId: string, value: unknown) => void
}

export function ApplicationQuestionFields({
  answers,
  questions,
  setAnswer,
}: ApplicationQuestionFieldsProps) {
  const t = useTranslations()
  return (
    <>
      {questions.map(question => (
        <div
          key={question.id}
          className='space-y-2'
        >
          <Label htmlFor={question.id}>
            {question.question}
            {question.is_required && (
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
              required={question.is_required}
            />
          )}

          {question.field_type === 'long_text' && (
            <Textarea
              id={question.id}
              value={(answers[question.id] as string) ?? ''}
              onChange={e => setAnswer(question.id, e.target.value)}
              rows={4}
              placeholder={t('extracted.communities.applicationForm.writeYourAnswer_10a15f8f')}
              required={question.is_required}
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
    </>
  )
}
