'use client'

import { useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import onError, { onSuccess } from '@/lib/on-error'
import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchTopic, fetchTopicMergeOperation, mergeTopicAliases } from '@/lib/api/client/topics'
import { topicManagementHref } from '@/lib/links/entity-href'
import type { Topic } from '@/types/topics'
import { canSubmitTopicMerge } from '@/components/admin/merge-topic-submit-readiness'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { TopicMergeResponseBody } from '@/types/api-responses'

export function MergeClient({ topic }: { topic: Topic }) {
  const t = useTranslations()
  const { push, refresh } = useRouter()
  const [destinationTopicId, setDestinationTopicId] = useState<string | null>(null)
  const [destinationTopicName, setDestinationTopicName] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [operation, setOperation] = useState<TopicMergeResponseBody['topic_merge'] | null>(null)
  const [checking, setChecking] = useState(false)

  const canSubmit = canSubmitTopicMerge({
    destinationTopicId,
    confirmation,
    topicName: topic.name,
    submitting,
  })
  const destinationLabel =
    destinationTopicName ?? t('extracted.settings.mergeClient.noDestinationSelected_5dd0a996')
  const excludeTopicIds = [topic.id]

  const handleDestinationChange = (id: string, name: string) => {
    setDestinationTopicId(id)
    setDestinationTopicName(name)
  }

  const handleConfirmationChange = (event: ChangeEvent<HTMLInputElement>) => {
    setConfirmation(event.target.value)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!destinationTopicId || !canSubmit) return
    setSubmitting(true)
    try {
      const response = await mergeTopicAliases(topic.id, destinationTopicId)
      setOperation(response.topic_merge)
      onSuccess(t('settings.topics.merge.queued'))
    } catch (err) {
      /* c8 ignore next 2 -- error path requires injecting a merge failure */
      onError(err, { fallback: t('extracted.settings.mergeClient.failedToMergeTopic_774455fd') })
      setSubmitting(false)
    }
  }

  const handleCheckStatus = async () => {
    if (!operation || checking) return
    setChecking(true)
    try {
      const response = await fetchTopicMergeOperation(operation.source_topic_id, operation.id)
      setOperation(response.topic_merge)
      if (response.topic_merge.status === 'completed') {
        onSuccess(t('settings.topics.merge.completed'))
        const destination = await fetchTopic(response.topic_merge.destination_topic_id)
        if (destination) {
          push(topicManagementHref(destination, 'settings/aliases'))
          refresh()
        }
      }
    } catch (err) {
      onError(err, { fallback: t('settings.topics.merge.statusFailed') })
    } finally {
      setChecking(false)
    }
  }

  return (
    <section
      data-pw='topic-settings-merge'
      className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'
    >
      <h2 className='mb-2 text-xl font-semibold text-foreground'>
        {t('extracted.settings.mergeClient.mergeTopic_8f07ac0c')}
      </h2>
      <p className='mb-4 text-sm text-muted-foreground'>
        {t('extracted.settings.mergeClient.moveAliasesFromTopicnameIntoA_0e6e15db', {
          topicName: topic.name,
        })}
      </p>
      {operation ? (
        <output className='space-y-3'>
          <p>
            {t(
              operation.status === 'failed'
                ? 'settings.topics.merge.failed'
                : operation.status === 'completed'
                  ? 'settings.topics.merge.completed'
                  : 'settings.topics.merge.queued',
            )}
          </p>
          {(operation.status === 'queued' || operation.status === 'running') && (
            <Button
              onClick={handleCheckStatus}
              loading={checking}
              disabled={checking}
            >
              {t('settings.topics.merge.checkStatus')}
            </Button>
          )}
        </output>
      ) : (
        <form
          onSubmit={handleSubmit}
          className='space-y-4'
        >
          <div className='space-y-2'>
            <Label htmlFor='merge-topic-destination'>
              {t('extracted.settings.mergeClient.destinationTopic_14dec461')}
            </Label>
            <TopicAutocomplete
              id='merge-topic-destination'
              label={destinationTopicName ?? ''}
              value={destinationTopicId}
              excludeIds={excludeTopicIds}
              disabled={submitting}
              clearOnTextEdit
              onChange={handleDestinationChange}
            />
            {!destinationTopicName && (
              <p className='text-xs text-muted-foreground'>{destinationLabel}</p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='merge-topic-confirmation'>
              {t('extracted.settings.mergeClient.typeTopicnameToConfirm_427f250b', {
                topicName: topic.name,
              })}
            </Label>
            <Input
              id='merge-topic-confirmation'
              data-pw='merge-topic-confirmation-input'
              value={confirmation}
              disabled={submitting}
              onChange={handleConfirmationChange}
            />
          </div>

          <Button
            type='submit'
            data-pw='merge-topic-submit'
            variant='destructive'
            loading={submitting}
            disabled={!canSubmit}
          >
            {t('extracted.settings.mergeClient.merge_8851aaa7')}
          </Button>
        </form>
      )}
    </section>
  )
}
