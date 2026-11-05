import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { EntityMenubarItem } from '@/components/shared/entity-menubar-nav'
import { getTopicTagTabsForTopicType } from '@/components/tags/tag-relation-configs'
import { Button } from '@/components/ui/button'
import type { useTranslations } from '@/lib/i18n/use-translations'
import { isActivePath } from '@/lib/utils/path'
import type { TopicTypes } from '@/types/topics'
import type { TopicDetailTab } from './topic-detail-tabs-helpers'
import { DataPw } from '@/components/shared/data-pw'

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
            <DataPw
              dataPw={`topic-detail-tab-${tab.name}`}
              as={Button}
              type='button'
              variant='ghost'
              size='sm'
            >
              {tab.label}
              <ChevronDown data-icon='inline-end' />
            </DataPw>
          ),
          active: activeTab === tab.name,
          dropdownItems: getTopicTagTabsForTopicType(topicTypeName).map(tagTab => ({
            key: tagTab.value,
            content: (
              <DataPw
                dataPw={`manage-tags-tab-${tagTab.value}`}
                as={Link}
                href={`/${topicType}/${topicId}/tags/${tagTab.value}`}
                prefetch={false}
                scroll={false}
                aria-current={
                  isActivePath(pathname, `/${topicType}/${topicId}/tags/${tagTab.value}`)
                    ? 'page'
                    : undefined
                }
              >
                {t(tagTab.label)}
              </DataPw>
            ),
            active: isActivePath(pathname, `/${topicType}/${topicId}/tags/${tagTab.value}`),
          })),
        }
      : {
          key: tab.name,
          content: (
            <DataPw
              dataPw={`topic-detail-tab-${tab.name}`}
              as={Link}
              href={tab.path}
              prefetch={false}
              scroll={false}
              aria-current={activeTab === tab.name ? 'page' : undefined}
            >
              {tab.label}
            </DataPw>
          ),
          active: activeTab === tab.name,
        },
  )
}
