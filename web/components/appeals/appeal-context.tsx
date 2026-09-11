'use client'

import type {
  ModerationActorSummary,
  ModerationAppeal,
  ModerationAppealTargetContext,
} from '@/types/appeals'
import { useTranslations } from '@/lib/i18n/use-translations'
import { PostContentText } from '@/components/posts/post-content-text'

function actorLabel(actor: ModerationActorSummary): string {
  return actor.verified_display_name ?? actor.username ?? actor.id
}

function targetDetail(context: ModerationAppealTargetContext | null): string | null {
  if (!context) return null
  if (context.type === 'warning') return context.public_message
  if (context.type === 'post_removal') return context.public_reason
  return context.reason
}

function targetLabel(appeal: ModerationAppeal, t: ReturnType<typeof useTranslations>): string {
  if (appeal.community_ban_id) return t('extracted.appeals.appealRow.communityBan_8ec5b51b')
  if (appeal.user_warning_id) return t('extracted.appeals.appealRow.warning_e981ddae')
  if (appeal.user_suspension_id) {
    return t('extracted.appeals.appealRow.platformSuspension_e2501d84')
  }
  if (appeal.post_id && appeal.post_removal_kind === 'community') {
    return t('extracted.appeals.appealRow.communityPostRemoval_b5b52d7e')
  }
  if (appeal.post_id && appeal.post_removal_kind === 'platform') {
    return t('extracted.appeals.appealRow.platformPostRemoval_a55ee32d')
  }
  if (appeal.post_id) return t('extracted.appeals.appealRow.postRemoval_84e75d95')
  return t('extracted.appeals.appealRow.unknown_b764cdc0')
}

export function AppealContext({ appeal }: { appeal: ModerationAppeal }) {
  const t = useTranslations()
  const detail = targetDetail(appeal.target_context)
  const community =
    appeal.target_context && 'community' in appeal.target_context
      ? appeal.target_context.community
      : null
  const staffContext = appeal.staff_context

  return (
    <div
      className='space-y-1 text-xs'
      data-pw='appeal-context'
    >
      <p className='font-medium'>{targetLabel(appeal, t)}</p>
      {staffContext ? <p>{actorLabel(staffContext.appellant)}</p> : null}
      {appeal.target_context?.type === 'post_removal' ? (
        <PostContentText
          as='p'
          content={{
            text: appeal.target_context.title,
            declared_language: appeal.target_context.declared_language,
            lingua_rs_detected_language: appeal.target_context.lingua_rs_detected_language,
          }}
          className='text-muted-foreground'
        />
      ) : null}
      {detail ? <p className='text-muted-foreground'>{detail}</p> : null}
      {community ? <p className='text-muted-foreground'>{community.name}</p> : null}
      {staffContext?.original_decision.internal_reason ? (
        <p className='text-muted-foreground'>{staffContext.original_decision.internal_reason}</p>
      ) : null}
      {staffContext?.original_decision.actor ? (
        <p className='text-muted-foreground'>{actorLabel(staffContext.original_decision.actor)}</p>
      ) : null}
    </div>
  )
}
