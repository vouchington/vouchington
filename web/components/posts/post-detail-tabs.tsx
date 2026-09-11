'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { EntityMenubarNav, type EntityMenubarItem } from '@/components/shared/entity-menubar-nav'
import { postTagTabs } from '@/components/tags/tag-relation-configs'
import { Button } from '@/components/ui/button'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PostDetailTabsProps {
  activeTab: 'comments' | 'manage-tags'
  commentCount: number
  postType: string
  postId: string
  isAuthenticated: boolean
  activeTag?: string
}

export function PostDetailTabs({
  activeTab,
  commentCount,
  postType,
  postId,
  isAuthenticated,
  activeTag,
}: PostDetailTabsProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const items: EntityMenubarItem[] = [
    {
      key: 'comments',
      content: (
        <Link
          href={`/${postType}/${postId}`}
          prefetch={false}
          scroll={false}
          aria-current={activeTab === 'comments' ? 'page' : undefined}
          data-pw='post-detail-tab-comments'
        >
          {t('extracted.posts.postDetailTabs.commentsCount_147198f2', {
            count: formatNumber(commentCount, uiLocale),
          })}
        </Link>
      ),
      active: activeTab === 'comments',
    },
  ]

  if (isAuthenticated) {
    items.push({
      key: 'manage-tags',
      content: (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          data-pw='post-detail-tab-manage-tags'
        >
          {t('extracted.posts.postDetailTabs.manageTags_7a3cc33f')}
          <ChevronDown data-icon='inline-end' />
        </Button>
      ),
      active: activeTab === 'manage-tags',
      dropdownItems: postTagTabs.map(tab => ({
        key: tab.value,
        content: (
          <Link
            href={`/${postType}/${postId}/tags/${tab.value}`}
            prefetch={false}
            scroll={false}
            aria-current={
              activeTab === 'manage-tags' && activeTag === tab.value ? 'page' : undefined
            }
            // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from relation config
            data-pw={`manage-tags-tab-${tab.value}`}
          >
            {t(tab.label)}
          </Link>
        ),
        active: activeTab === 'manage-tags' && activeTag === tab.value,
      })),
    })
  }

  return (
    <EntityMenubarNav
      items={items}
      ariaLabel={t('extracted.posts.postDetailTabs.postDetailNavigation_25cd2d61')}
      preserveScrollOnNavigation
    />
  )
}
