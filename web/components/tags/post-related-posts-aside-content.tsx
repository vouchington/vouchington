import {
  PostRelatedEntityAsideContent,
  type PostRelatedEntityAsideContentProps,
} from './post-related-entity-aside-content'

type PostRelatedPostsAsideContentProps = Omit<PostRelatedEntityAsideContentProps, 'kind'>

export function PostRelatedPostsAsideContent(props: PostRelatedPostsAsideContentProps) {
  return (
    <PostRelatedEntityAsideContent
      {...props}
      kind='posts'
    />
  )
}
