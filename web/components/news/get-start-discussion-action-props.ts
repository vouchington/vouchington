export interface DiscussionActionProps {
  isLoggedIn: boolean
  relatedUrlId?: string
  hasStoryPost?: boolean
}

export function getStartDiscussionActionProps(
  props: DiscussionActionProps,
): { urlId: string } | null {
  if (!props.isLoggedIn || props.hasStoryPost) return null
  return props.relatedUrlId ? { urlId: props.relatedUrlId } : null
}
