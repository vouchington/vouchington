'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ChevronUp } from 'lucide-react'
import { UserOfficialBadge } from '@/components/shared/user-official-badge'
import { TimeAgo } from '@/components/shared/time-ago'
import { UserAvatar } from '@/components/shared/user-avatar'
import { UserLink } from '@/components/users/user-link'
import { Button } from '@/components/ui/button'
import { userTabForPostType } from '@/lib/links/entity-href'
import type { MouseEvent, ReactNode } from 'react'
import type { CommentNodeData } from './comment-tree-utils'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ReportMenuKebab as ReportMenuKebabComponent } from '@/components/shared/report-menu-item'

const ReportMenuKebab = dynamic<Parameters<typeof ReportMenuKebabComponent>[0]>(
  () => import('@/components/shared/report-menu-item').then(m => m.ReportMenuKebab),
  { ssr: false },
)

interface CommentNodeHeaderProps {
  childrenCount: number
  hideDownCount: boolean
  isAnonymous: boolean
  isCollapsed: boolean
  isDeleted: boolean
  node: CommentNodeData
  onToggleCollapse: (id: string) => void
  permalink: string
  reportEntityId?: string
  trailing?: ReactNode
  username: string
}

const stopCommentHeaderLinkClickPropagation = (e: MouseEvent<HTMLAnchorElement>) =>
  e.stopPropagation()

export function CommentNodeHeader(props: CommentNodeHeaderProps) {
  const t = useTranslations()
  const { election, post } = props.node
  const toggleComment = () => props.onToggleCollapse(post.id)
  return (
    <div className='relative mb-1 flex select-none items-center gap-2 text-xs text-muted-foreground'>
      <Button
        type='button'
        variant='ghost'
        aria-label={
          props.isCollapsed
            ? t('extracted.comments.commentNodeHeader.expandCommentMetadataRow_4e8596a4')
            : t('extracted.comments.commentNodeHeader.collapseCommentMetadataRow_8a8a973e')
        }
        className='absolute inset-0 z-0 h-auto w-auto cursor-pointer rounded-none border-0 bg-transparent p-0 hover:bg-transparent'
        onClick={toggleComment}
      />
      <Button
        type='button'
        variant='ghost'
        aria-expanded={!props.isCollapsed}
        aria-label={
          props.isCollapsed
            ? t('extracted.comments.commentNodeHeader.expandCommentThread_5a325f11')
            : t('extracted.comments.commentNodeHeader.collapseCommentThread_24e66c3a')
        }
        className='relative z-10 flex h-6 w-6 items-center justify-center rounded p-0'
        data-pw='comment-collapse-button'
        onClick={e => {
          e.stopPropagation()
          toggleComment()
        }}
      >
        <ChevronUp
          className={`h-3 w-3 transition-transform ${props.isCollapsed ? 'rotate-180' : ''}`}
        />
      </Button>
      <CommentAuthorAvatar {...props} />
      <CommentAuthorName {...props} />
      {post.created_by?.is_official_account && (
        <span className='pointer-events-none relative'>
          <UserOfficialBadge isOfficial={post.created_by.is_official_account} />
        </span>
      )}
      <Link
        prefetch={false}
        href={props.permalink}
        className='relative z-10 inline-flex min-h-6 items-center hover:underline'
        data-pw='comment-permalink-link'
        onClick={stopCommentHeaderLinkClickPropagation}
      >
        <TimeAgo date={post.created_at} />
      </Link>
      {props.isCollapsed && election && (
        <span className='pointer-events-none relative ml-1'>
          {t('extracted.votes.semanticVote.positiveVotes', {
            count: election.votes_count_up ?? 0,
          })}{' '}
          {!props.hideDownCount && (
            <>
              {t('extracted.votes.semanticVote.negativeVotes', {
                count: election.votes_count_down ?? 0,
              })}{' '}
            </>
          )}
          {t('extracted.comments.commentNodeHeader.childrenCount_8f9bff0a', {
            childrenCount: props.childrenCount,
          })}
        </span>
      )}
      {props.reportEntityId || props.trailing ? (
        <span className='relative z-10 ml-auto flex items-center gap-1'>
          {props.reportEntityId ? (
            <ReportMenuKebab
              entityType='comment'
              entityId={props.reportEntityId}
            />
          ) : null}
          {props.trailing}
        </span>
      ) : null}
    </div>
  )
}

function CommentAuthorAvatar(props: CommentNodeHeaderProps) {
  const { post } = props.node
  if (props.isDeleted || props.isAnonymous || !post.created_by) return null
  return (
    <UserLink
      user={post.created_by}
      tab={userTabForPostType('comment')}
      onClick={stopCommentHeaderLinkClickPropagation}
      className='relative z-10 inline-flex min-h-6 items-center'
    >
      <UserAvatar
        profileImageId={post.created_by.profile_image_id}
        profileImagePlacement={post.created_by.profile_image_placement}
        username={props.username}
        size='sm'
      />
    </UserLink>
  )
}

function CommentAuthorName(props: CommentNodeHeaderProps) {
  const t = useTranslations()
  const { post } = props.node
  if (props.isDeleted)
    return (
      <span className='pointer-events-none italic'>
        {t('extracted.comments.commentNodeHeader.deleted_dd5f43ed')}
      </span>
    )
  if (!props.isAnonymous && post.created_by) {
    return (
      <UserLink
        user={post.created_by}
        tab={userTabForPostType('comment')}
        className='relative z-10 inline-flex min-h-6 items-center font-medium text-foreground hover:underline'
        onClick={stopCommentHeaderLinkClickPropagation}
      >
        {props.username}
      </UserLink>
    )
  }
  return <span className='pointer-events-none font-medium text-foreground'>{props.username}</span>
}
