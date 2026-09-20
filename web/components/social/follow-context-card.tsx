'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { UserAvatar } from '@/components/shared/user-avatar'
import type { FollowContextUsers } from '@/types/api-responses'
import type { PublicUser } from '@/types/user'
import { userHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Section {
  title: string
  data?: FollowContextUsers | null
  emptyLabel: string
}

function hasSectionData(section: Section): section is Section & { data: FollowContextUsers } {
  return Boolean(section.data)
}

function getUserLabel(user: PublicUser, t: ReturnType<typeof useTranslations>): string {
  return (
    user.username ??
    user.display_account?.name ??
    t('extracted.social.followContextCard.unknownUser_0bca6947')
  )
}

function FollowContextUserList({ users }: { users: PublicUser[] }) {
  const t = useTranslations()
  return (
    <div className='space-y-2'>
      {users.map(user => {
        const label = getUserLabel(user, t)
        const href = userHref(user)
        const content = (
          <div className='flex items-center gap-2 rounded-md border px-2 py-1.5'>
            <span className='min-w-0 flex-1 truncate text-sm'>{label}</span>
            {user.profile_image_id && (
              <UserAvatar
                profileImageId={user.profile_image_id}
                profileImagePlacement={user.profile_image_placement}
                username={label}
                size='sm'
                className='flex-shrink-0'
              />
            )}
          </div>
        )

        return (
          <Link
            key={user.id}
            href={href}
            prefetch={false}
            className='block'
          >
            {content}
          </Link>
        )
      })}
    </div>
  )
}

export function FollowContextCard({ title, sections }: { title: string; sections: Section[] }) {
  const t = useTranslations()
  const visibleSections = sections.filter(hasSectionData)
  const hasContent = visibleSections.some(section => section.data.total > 0)
  if (!hasContent) return null

  return (
    <Card data-pw='follow-context-card'>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>{title}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {visibleSections.map(section => {
          const overflow = section.data.total - section.data.users.length
          return (
            <section
              key={section.title}
              className='space-y-2'
            >
              <div className='flex items-center justify-between gap-2'>
                <h3 className='text-sm font-medium'>{section.title}</h3>
                <span className='text-xs text-muted-foreground'>{section.data.total}</span>
              </div>
              {section.data.users.length > 0 ? (
                <>
                  <FollowContextUserList users={section.data.users} />
                  {overflow > 0 ? (
                    <p className='text-xs text-muted-foreground'>
                      {t('extracted.social.followContextCard.andOverflowMore_221c6bd9', {
                        overflow,
                      })}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className='text-sm text-muted-foreground'>{section.emptyLabel}</p>
              )}
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}
