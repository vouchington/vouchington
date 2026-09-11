'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import {
  rejectRssFeedCategory,
  unrejectRssFeedCategory,
  assignRssFeedCategory,
} from '@/lib/api/client/rss-feed-categories'
import { createTopicCollectionPathname } from '@/lib/links/entity-href'
import onError, { onSuccess } from '@/lib/on-error'
import { slugify } from '@ts-shared/utils/slugs'
import { toTitleCase } from '@ts-shared/utils/strings'
import type { UnmappedCategory } from '@/types/rss-feed-categories'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  category: UnmappedCategory
}

export function CategoryRowActions({ category }: Props) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const [assigning, setAssigning] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  async function handleReject() {
    setRejecting(true)
    try {
      await rejectRssFeedCategory(category.category_text)
      onSuccess(t('extracted.rssFeedCategories.categoryRowActions.categoryRejected_99bd8f6f'))
      refresh()
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.rssFeedCategories.categoryRowActions.failedToRejectCategory_b2bfbb7b',
        ),
      })
      setRejecting(false)
    }
  }

  async function handleUnreject() {
    setRejecting(true)
    try {
      await unrejectRssFeedCategory(category.category_text)
      onSuccess(t('extracted.rssFeedCategories.categoryRowActions.categoryRestored_f53f365f'))
      refresh()
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.rssFeedCategories.categoryRowActions.failedToRestoreCategory_536038ff',
        ),
      })
      setRejecting(false)
    }
  }

  async function handleAssign(topicId: string, _topicName: string) {
    setAssigning(true)
    try {
      const { updated } = await assignRssFeedCategory(category.category_text, topicId)
      onSuccess(
        t('extracted.rssFeedCategories.categoryRowActions.assignedCountItemSBackfilled_d10d9547', {
          count: updated,
        }),
      )
      refresh()
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.rssFeedCategories.categoryRowActions.failedToAssignCategory_c179fdad',
        ),
      })
      setAssigning(false)
    }
  }

  const createTopicHref = createTopicCollectionPathname(
    `/create?name=${encodeURIComponent(toTitleCase(category.category_text.replace(/-/g, ' ')).trim())}&slug=${encodeURIComponent(slugify(category.category_text))}`,
  )

  return (
    <div
      className='flex flex-wrap items-center gap-2'
      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
      data-pw={`category-row-actions-${category.category_text}`}
    >
      <TopicAutocomplete
        value={null}
        label=''
        onChange={handleAssign}
        placeholder={t('extracted.rssFeedCategories.categoryRowActions.assignToTopic_367a128b')}
        ariaLabel={t(
          'extracted.rssFeedCategories.categoryRowActions.assignCategoryToTopic_7e4a9c15',
        )}
        disabled={assigning}
      />
      <Link
        href={createTopicHref}
        prefetch={false}
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
        data-pw={`category-create-topic-${category.category_text}`}
        className='text-sm text-primary underline-offset-2 hover:underline'
      >
        {t('extracted.rssFeedCategories.categoryRowActions.createTopic_488184ed')}
      </Link>
      {category.rejected ? (
        <Button
          size='sm'
          variant='outline'
          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
          data-pw={`category-unreject-${category.category_text}`}
          disabled={rejecting}
          onClick={handleUnreject}
        >
          {t('extracted.rssFeedCategories.categoryRowActions.unReject_067277f5')}
        </Button>
      ) : (
        <Button
          size='sm'
          variant='ghost'
          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
          data-pw={`category-reject-${category.category_text}`}
          disabled={rejecting}
          onClick={handleReject}
        >
          {t('extracted.rssFeedCategories.categoryRowActions.reject_ab604a36')}
        </Button>
      )}
    </div>
  )
}
