'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isActivePath } from '@/lib/utils/path'
import {
  topicIdOrSlug,
  topicManagementHref,
  type TopicSettingsSubPage,
} from '@/lib/links/entity-href'
import type { EntityMenubarItem } from '@/components/shared/entity-menubar-nav'

interface SettingsSubPageConfig {
  segment: TopicSettingsSubPage
  label: string
}

const BASE_SETTINGS_SUBPAGES: SettingsSubPageConfig[] = [
  { segment: 'about', label: 'About' },
  { segment: 'behavior', label: 'Behavior' },
  { segment: 'domains', label: 'Domains' },
  { segment: 'aliases', label: 'Aliases' },
  { segment: 'merge', label: 'Merge' },
]

export function buildAdminTabItems(
  topicType: string,
  topicId: string,
  topicSlug: string | null | undefined,
  pathname: string,
  topicTypeName?: string,
): EntityMenubarItem[] {
  const subPages: SettingsSubPageConfig[] = [
    ...BASE_SETTINGS_SUBPAGES.slice(0, 3),
    ...(topicTypeName === 'rss_feed'
      ? [{ segment: 'source' as TopicSettingsSubPage, label: 'Source' }]
      : []),
    ...(topicTypeName === 'referral_program'
      ? [{ segment: 'validations' as TopicSettingsSubPage, label: 'Validations' }]
      : []),
    ...BASE_SETTINGS_SUBPAGES.slice(3),
  ]

  const idOrSlug = topicIdOrSlug({ id: topicId, slug: topicSlug })
  const isOnSettingsPath = isActivePath(pathname, `/${topicType}/${idOrSlug}/settings`)

  return [
    {
      key: 'settings',
      content: (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          data-pw='topic-detail-tab-settings'
        >
          Settings
          <ChevronDown data-icon='inline-end' />
        </Button>
      ),
      active: isOnSettingsPath,
      dropdownItems: subPages.map(sub => ({
        key: sub.segment,
        content: (
          <Link
            href={topicManagementHref(
              { topic_type: topicType, id: topicId, slug: topicSlug },
              `settings/${sub.segment}`,
            )}
            prefetch={false}
            aria-current={
              isActivePath(pathname, `/${topicType}/${idOrSlug}/settings/${sub.segment}`)
                ? 'page'
                : undefined
            }
            // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from settings sub-page config
            data-pw={`settings-tab-${sub.segment}`}
          >
            {sub.label}
          </Link>
        ),
        active: isActivePath(pathname, `/${topicType}/${idOrSlug}/settings/${sub.segment}`),
      })),
    },
  ]
}
