import type { Dispatch, SetStateAction } from 'react'
import type { PostElection, ElectionVote, Post } from '@/types/posts'
import type { PublicUser } from '@/types/user'
import type {
  EditableState,
  TopicRecommendationEditablePost,
  TopicRecommendationEditablePostWithId,
} from './topic-recommendation-editable-state'

export type TopicRecommendationDialogPost = TopicRecommendationEditablePost & Pick<Post, 'id'>

export interface TopicRecommendationDialogProps {
  editableState: EditableState | null
  isAdmin: boolean
  isSaving: boolean
  selected: TopicRecommendationDialogPost | null
  selectedElection?: Pick<PostElection, 'id' | 'votes_count_up' | 'votes_count_down'>
  selectedHtml: string
  selectedVote?: Pick<ElectionVote, 'choice'>
  hideDownCount?: boolean
  orderedPostIds: string[]
  users?: Record<string, PublicUser>
  navigateToId: (id: string) => void
  setEditableState: Dispatch<SetStateAction<EditableState | null>>
  onApprove: (post: TopicRecommendationEditablePostWithId) => Promise<void>
  onOpenChange: (open: boolean) => void
  onPersistChanges: (post: TopicRecommendationEditablePostWithId) => Promise<void>
  onReject: (post: TopicRecommendationEditablePostWithId) => Promise<void>
}
