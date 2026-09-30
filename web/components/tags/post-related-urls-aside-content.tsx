import {
  PostRelatedEntityAsideContent,
  type PostRelatedEntityAsideContentProps,
} from './post-related-entity-aside-content'

type PostRelatedUrlsAsideContentProps = Omit<
  PostRelatedEntityAsideContentProps,
  'kind' | 'response'
>

export function PostRelatedUrlsAsideContent(props: PostRelatedUrlsAsideContentProps) {
  return (
    <PostRelatedEntityAsideContent
      {...props}
      kind='urls'
    />
  )
}
