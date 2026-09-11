'use client'

import Link from 'next/link'
import { createPostPathname, domainHref, topicHref, urlHref } from '@/lib/links/entity-href'
import { getPostSlugFromType } from '@/lib/route-configs'
import { useTranslations } from '@/lib/i18n/use-translations'
import { PostContentText } from '@/components/posts/post-content-text'
import type {
  CommunityListItem,
  CommunityListItemType,
  CommunityListPageData,
} from '@/types/api-responses'

type CommunityListItemContentProps = {
  item: CommunityListItem
  itemType: CommunityListItemType
  data: CommunityListPageData
}

export function CommunityListItemContent({ item, itemType, data }: CommunityListItemContentProps) {
  const t = useTranslations()
  switch (itemType) {
    case 'topic': {
      const topic = data.topics?.[item.entity_id]
      if (!topic)
        return (
          <span className='text-sm text-muted-foreground'>
            {t('extracted.communities.communityListItemCard.topicNotFound_a53e8c70')}
          </span>
        )
      return (
        <Link
          href={topicHref(topic)}
          prefetch={false}
          className='font-medium hover:underline'
        >
          {topic.name}
        </Link>
      )
    }
    case 'rss_feed': {
      const feed = data.rss_feeds?.[item.entity_id]
      if (!feed)
        return (
          <span className='text-sm text-muted-foreground'>
            {t('extracted.communities.communityListItemCard.feedNotFound_3f86202e')}
          </span>
        )
      return (
        <Link
          href={`/rss-feeds/${feed.id}`}
          prefetch={false}
          className='font-medium hover:underline'
        >
          {feed.title}
        </Link>
      )
    }
    case 'post': {
      const post = data.posts?.[item.entity_id]
      if (!post)
        return (
          <span className='text-sm text-muted-foreground'>
            {t('extracted.communities.communityListItemCard.postNotFound_dba8fb4c')}
          </span>
        )
      const postHref =
        post.post_type === 'comment'
          ? null
          : createPostPathname(getPostSlugFromType(post.post_type), post)
      return (
        <div>
          {postHref ? (
            <PostContentText
              as={Link}
              href={postHref}
              prefetch={false}
              className='font-medium hover:underline'
              content={{
                text: post.title,
                declared_language: post.declared_language,
                lingua_rs_detected_language: post.lingua_rs_detected_language,
              }}
            />
          ) : (
            <PostContentText
              as='span'
              className='font-medium'
              content={{
                text: post.title,
                declared_language: post.declared_language,
                lingua_rs_detected_language: post.lingua_rs_detected_language,
              }}
            />
          )}
          <p
            className='mt-1 text-sm text-muted-foreground'
            suppressHydrationWarning
          >
            {new Date(post.created_at).toLocaleDateString()}
          </p>
        </div>
      )
    }
    case 'url_hostname': {
      const hostname = data.url_hostnames?.[item.entity_id]
      if (!hostname)
        return (
          <span className='text-sm text-muted-foreground'>
            {t('extracted.communities.communityListItemCard.domainNotFound_7b8fc0e6')}
          </span>
        )
      return (
        <Link
          href={domainHref(hostname)}
          prefetch={false}
          className='font-medium hover:underline'
        >
          {hostname.hostname}
        </Link>
      )
    }
    case 'url': {
      const url = data.urls?.[item.entity_id]
      if (!url)
        return (
          <span className='text-sm text-muted-foreground'>
            {t('extracted.communities.communityListItemCard.urlNotFound_92e3f530')}
          </span>
        )
      return (
        <Link
          href={urlHref(url)}
          prefetch={false}
          className='font-medium hover:underline'
        >
          {url.url}
        </Link>
      )
    }
  }
}
