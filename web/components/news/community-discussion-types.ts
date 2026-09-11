export interface NewsCommunityDiscussionTarget {
  id: string
  name: string
  slug: string
  visibility: 'public' | 'private'
  post_approval_required_at?: string | null
}

export interface NewsCommunityDiscussionUrl {
  id: string
  url: string
}
