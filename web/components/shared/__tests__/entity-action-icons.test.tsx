import { describe, expect, it } from 'vitest'
import * as LucideIcons from 'lucide-react'
import { EntityActionIcons } from '../entity-action-icons'

describe('EntityActionIcons', () => {
  it('maps every semantic entity action to the canonical Lucide icon', () => {
    const expected = {
      block: LucideIcons.Ban,
      commentCount: LucideIcons.MessageSquare,
      copy: LucideIcons.Copy,
      delete: LucideIcons.Trash2,
      discussionLink: LucideIcons.MessageSquare,
      edit: LucideIcons.Pencil,
      follow: LucideIcons.UserPlus,
      hide: LucideIcons.EyeOff,
      join: LucideIcons.UserPlus,
      leave: LucideIcons.UserMinus,
      listen: LucideIcons.Play,
      more: LucideIcons.MoreHorizontal,
      mute: LucideIcons.EyeOff,
      notificationDismiss: LucideIcons.Trash2,
      proxyFollow: LucideIcons.UserPlus,
      proxyMute: LucideIcons.EyeOff,
      quote: LucideIcons.MessageSquareQuote,
      recommendationDismiss: LucideIcons.X,
      recommendationWithdraw: LucideIcons.Undo2,
      referralLink: LucideIcons.Link2,
      referralLinkCreate: LucideIcons.Link2,
      report: LucideIcons.Flag,
      reply: LucideIcons.MessageSquareReply,
      rssFeed: LucideIcons.Rss,
      save: LucideIcons.Bookmark,
      saved: LucideIcons.BookmarkCheck,
      sendChatMessage: LucideIcons.Send,
      sendToFollowers: LucideIcons.Send,
      shareDataPoint: LucideIcons.BarChart3,
      shareWithFollowers: LucideIcons.Share2,
      startDiscussion: LucideIcons.MessageSquarePlus,
      subscribe: LucideIcons.BellPlus,
      subscribed: LucideIcons.BellCheck,
      unfollow: LucideIcons.UserMinus,
      writeReview: LucideIcons.PenLine,
    } satisfies Record<keyof typeof EntityActionIcons, unknown>

    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      expect(EntityActionIcons[key]).toBe(expected[key])
    }
  })
})
