import {
  PostRelatedEntityAsideContent,
  type PostRelatedEntityAsideContentProps,
} from './post-related-entity-aside-content'

type PostRelatedTopicsAsideContentProps = Omit<PostRelatedEntityAsideContentProps, 'kind'>

export function PostRelatedTopicsAsideContent(props: PostRelatedTopicsAsideContentProps) {
  return (
    <PostRelatedEntityAsideContent
      {...props}
      kind='topics'
    />
  )
}
