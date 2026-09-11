'use client'

import { useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import { useAvailabilityCheck } from '@/hooks/use-availability-check'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { useResolvedBreadcrumbs } from '@/lib/navigation/use-resolved-breadcrumbs'
import { Button } from '@/components/ui/button'
import { SimilarityPanels } from '@/components/admin/similarity/similarity-panels'
import { CreateTopicIdentityFields } from '@/components/admin/topics/create-topic-identity-fields'
import { CreateTopicFormFields } from './create-topic-form-fields'
import { createTopic } from '@/lib/api/client/topics'
import onError from '@/lib/on-error'
import { topicManagementHref } from '@/lib/links/entity-href'
import type { TopicTypes } from '@/types/topics'
import { slugify } from '@ts-shared/utils/slugs'
import { useTranslations } from '@/lib/i18n/use-translations'

export default function CreateTopicPage() {
  return (
    <Suspense fallback={null}>
      <CreateTopicPageContent />
    </Suspense>
  )
}
function CreateTopicPageContent() {
  const t = useTranslations()
  const { push } = useRouter()
  const searchParams = useSearchParams()
  const initialName = searchParams.get('name') ?? ''
  const initialSlug = searchParams.get('slug') ?? ''
  const sourceTopicAliasId = searchParams.get('source_topic_alias_id') ?? undefined
  const mounted = useDidHydrate()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(initialName)
  const [slug, setSlug] = useState(initialSlug)
  const slugManuallyEditedRef = useRef(initialSlug !== '')
  const [markdown, setMarkdown] = useState('')
  const [topicType, setTopicType] = useState<TopicTypes>('topic')
  const slugAvailability = useAvailabilityCheck('topic-slug')
  const nameAvailability = useAvailabilityCheck('topic-name')

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setName(value)
    nameAvailability.reset()
    if (!slugManuallyEditedRef.current) {
      setSlug(slugify(value))
      slugAvailability.reset()
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlug(e.target.value)
    slugManuallyEditedRef.current = true
    slugAvailability.reset()
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)

    try {
      const formData = new FormData(e.currentTarget)
      const hostname = (formData.get('hostname') as string)?.trim() || null

      const { topic } = await createTopic({
        name,
        slug,
        topic_type: topicType,
        markdown,
        hostname,
        source_topic_alias_id: sourceTopicAliasId,
      })
      push(topicManagementHref(topic))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.create.createTopicClient.failedToCreateTopic_f25ea5ce'),
        tags: { form: 'create-topic' },
      })
      setSaving(false)
    }
  }
  const breadcrumbItems = useResolvedBreadcrumbs({
    tail: [
      { name: 'Topics', path: '/topics' },
      { name: 'Create', path: '/topics/create' },
    ],
  })
  return (
    <div>
      <Breadcrumbs items={breadcrumbItems} />
      <h1
        className='mb-8 max-w-2xl text-xl font-semibold text-foreground'
        data-pw='create-topic-heading'
      >
        {t('extracted.create.createTopicClient.createTopic_15c75a49')}
      </h1>

      <div className='flex flex-col gap-8 lg:flex-row'>
        <form
          onSubmit={handleSubmit}
          className='w-full max-w-2xl space-y-6'
        >
          <CreateTopicIdentityFields
            name={name}
            slug={slug}
            onNameChange={handleNameChange}
            onSlugChange={handleSlugChange}
            nameAvailability={nameAvailability}
            slugAvailability={slugAvailability}
          />

          <CreateTopicFormFields
            topicType={topicType}
            onTopicTypeChange={setTopicType}
            markdown={markdown}
            onMarkdownChange={setMarkdown}
          />

          <div>
            <Button
              type='submit'
              data-pw='create-topic-submit'
              loading={saving}
              disabled={!mounted || saving}
            >
              {saving
                ? t('extracted.create.createTopicClient.creating_def70944')
                : t('extracted.create.createTopicClient.createTopic_15c75a49')}
            </Button>
          </div>
        </form>

        <aside
          className='w-full shrink-0 lg:w-80'
          aria-label={t('extracted.create.createTopicClient.duplicateCheck_3039e724')}
        >
          <SimilarityPanels
            query={[name, slug, markdown].filter(Boolean).join('\n')}
            layout='aside'
          />
        </aside>
      </div>
    </div>
  )
}
