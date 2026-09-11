'use client'

import { fetchPosts } from '@/lib/api/client/posts'
import { humanizePostType } from '@ts-shared/utils/format'
import type { Post, PostType } from '@/types/posts'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { PostContentText } from '@/components/posts/post-content-text'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  value: string | null
  label: string
  onChange: (id: string, title: string) => void
  postTypes?: PostType[]
  placeholder?: string
  id?: string
  disabled?: boolean
}

export function PostAutocomplete({
  value: _value,
  label,
  onChange,
  postTypes,
  placeholder,
  id,
  disabled,
}: Props) {
  const t = useTranslations()
  const search = async (q: string, signal: AbortSignal) => {
    const res = await fetchPosts({ q, limit: 10, post_types: postTypes, signal })
    return Object.values(res.posts ?? {})
  }

  return (
    <EntityAutocomplete
      queryLabel={label}
      search={search}
      getKey={(post: Post) => post.id}
      getItemValue={(post: Post) => post.id}
      placeholder={placeholder ?? t('extracted.posts.postAutocomplete.searchPosts_015f89cf')}
      ariaLabel={t('extracted.posts.postAutocomplete.searchPosts_2f810cde')}
      emptyText={t('extracted.posts.postAutocomplete.noPostsFound_0232d174')}
      id={id}
      disabled={disabled}
      onSelect={(post: Post, { setQuery }: { setQuery: (query: string) => void }) => {
        onChange(post.id, post.title)
        setQuery(post.title)
      }}
      renderItem={(post: Post) => (
        <>
          <PostContentText
            as='span'
            content={{
              text: post.title,
              declared_language: post.declared_language,
              lingua_rs_detected_language: post.lingua_rs_detected_language,
            }}
          />
          <span className='text-xs text-muted-foreground'>{humanizePostType(post.post_type)}</span>
        </>
      )}
    />
  )
}
