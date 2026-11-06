import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { EntityMenubarItem } from '@/components/shared/entity-menubar-nav'
import { getTopicTagTabsForTopicType } from '@/components/tags/tag-relation-configs'
import { Button } from '@/components/ui/button'
import type { useTranslations } from '@/lib/i18n/use-translations'
import { isActivePath } from '@/lib/utils/path'
import type { TopicTypes } from '@/types/topics'
import type { TopicDetailTab } from './topic-detail-tabs-helpers'

interface BuildTopicDetailMenubarItemsOptions {
  tabs: TopicDetailTab[]
  activeTab: string
  pathname: string
  topicType: string
  topicId: string
  topicTypeName?: TopicTypes
  t: ReturnType<typeof useTranslations>
}

export function buildTopicDetailMenubarItems({
  tabs,
  activeTab,
  pathname,
  topicType,
  topicId,
  topicTypeName,
  t,
}: BuildTopicDetailMenubarItemsOptions): EntityMenubarItem[] {
  return tabs.map(tab =>
    tab.name === 'manage-tags'
      ? {
          key: tab.name,
          content: (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from tab config
              data-pw={`topic-detail-tab-${tab.name}`}
            >
              {tab.label}
              <ChevronDown data-icon='inline-end' />
            </Button>
          ),
          active: activeTab === tab.name,
          dropdownItems: getTopicTagTabsForTopicType(topicTypeName).map(tagTab => ({
            key: tagTab.value,
            content: (
              <Link
                href={`/${topicType}/${topicId}/tags/${tagTab.value}`}
                prefetch={false}
                scroll={false}
                aria-current={
                  isActivePath(pathname, `/${topicType}/${topicId}/tags/${tagTab.value}`)
                    ? 'page'
                    : undefined
                }
                // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from relation config
                data-pw={`manage-tags-tab-${tagTab.value}`}
              >
                {t(tagTab.label)}
              </Link>
            ),
            active: isActivePath(pathname, `/${topicType}/${topicId}/tags/${tagTab.value}`),
          })),
        }
      : {
          key: tab.name,
          content: (
            <Link
              href={tab.path}
              prefetch={false}
              scroll={false}
              aria-current={activeTab === tab.name ? 'page' : undefined}
              // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from tab config
              data-pw={`topic-detail-tab-${tab.name}`}
            >
              {tab.label}
            </Link>
          ),
          active: activeTab === tab.name,
        },
  )
}
