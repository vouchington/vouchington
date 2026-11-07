'use client'

import { clientApi } from './instance'
import { parseCopyrightHostedUseUrl } from './copyright-notice-hosted-use-url'
import type { CopyrightNoticeTargetInput } from './copyright-notices'

export type CopyrightNoticeResolvedTarget = CopyrightNoticeTargetInput & {
  order_index: number
  caption: string
}

type ImagePlacement = { image_id: string }
type HostedPostResponse = { post: { id: string } }
type HostedImagesResponse = {
  images: Array<{ image_id: string; order_index: number; caption: string }>
}
type HostedUserResponse = {
  user: { id: string; profile_image_placement?: ImagePlacement | null }
  profile_links: Array<{
    id: string
    image_placement?: ImagePlacement | null
    name?: string | null
  }>
}
type HostedTopicResponse = {
  topic: {
    id: string
    topic_type: string
    logo_image_placement?: ImagePlacement | null
    hero_image_placement?: ImagePlacement | null
  }
}
type HostedCommunityResponse = {
  community: {
    id: string
    profile_image_placement?: ImagePlacement | null
    banner_image_placement?: ImagePlacement | null
  }
}

/** Lists live image choices from the public page's API response. The notice service rechecks them. */
export async function resolveCopyrightNoticeTargets(
  targetUrl: string,
): Promise<CopyrightNoticeResolvedTarget[]> {
  const hostedUse = parseCopyrightHostedUseUrl(targetUrl)
  const identifier = encodeURIComponent(hostedUse.identifier)
  let targets: CopyrightNoticeResolvedTarget[]
  switch (hostedUse.kind) {
    case 'post': {
      const [{ post }, { images }] = await Promise.all([
        clientApi.get<HostedPostResponse>(`/api/v1/posts/${identifier}`),
        clientApi.get<HostedImagesResponse>(`/api/v1/posts/${identifier}/images`),
      ])
      targets = images.map(image => ({
        surface: 'post-image',
        post_id: post.id,
        image_id: image.image_id,
        target_url: hostedUse.hostedUseUrl,
        order_index: image.order_index,
        caption: image.caption,
      }))
      break
    }
    case 'user': {
      const { user, profile_links: links } = await clientApi.get<HostedUserResponse>(
        `/api/v1/users/${identifier}`,
      )
      targets = []
      if (user.profile_image_placement) {
        targets.push({
          surface: 'user-profile-image',
          user_id: user.id,
          image_id: user.profile_image_placement.image_id,
          target_url: hostedUse.hostedUseUrl,
          order_index: targets.length,
          caption: 'Profile image',
        })
      }
      for (const link of links) {
        if (!link.image_placement) continue
        targets.push({
          surface: 'user-profile-link-image',
          user_profile_link_id: link.id,
          image_id: link.image_placement.image_id,
          target_url: hostedUse.hostedUseUrl,
          order_index: targets.length,
          caption: link.name ? `Profile link image: ${link.name}` : 'Profile link image',
        })
      }
      break
    }
    case 'topic': {
      const { topic } = await clientApi.get<HostedTopicResponse>(`/api/v1/topics/${identifier}`)
      if (topic.topic_type !== hostedUse.topicType)
        throw new Error('This topic URL is unavailable.')
      targets = []
      if (topic.logo_image_placement) {
        targets.push({
          surface: 'topic-logo-image',
          topic_id: topic.id,
          image_id: topic.logo_image_placement.image_id,
          target_url: hostedUse.hostedUseUrl,
          order_index: targets.length,
          caption: 'Topic logo',
        })
      }
      if (topic.hero_image_placement) {
        targets.push({
          surface: 'topic-hero-image',
          topic_id: topic.id,
          image_id: topic.hero_image_placement.image_id,
          target_url: hostedUse.hostedUseUrl,
          order_index: targets.length,
          caption: 'Topic hero image',
        })
      }
      break
    }
    case 'community': {
      const { community } = await clientApi.get<HostedCommunityResponse>(
        `/api/v1/communities/${identifier}`,
      )
      targets = []
      if (community.profile_image_placement) {
        targets.push({
          surface: 'community-profile-image',
          community_id: community.id,
          image_id: community.profile_image_placement.image_id,
          target_url: hostedUse.hostedUseUrl,
          order_index: targets.length,
          caption: 'Community profile image',
        })
      }
      if (community.banner_image_placement) {
        targets.push({
          surface: 'community-banner-image',
          community_id: community.id,
          image_id: community.banner_image_placement.image_id,
          target_url: hostedUse.hostedUseUrl,
          order_index: targets.length,
          caption: 'Community banner image',
        })
      }
      break
    }
  }
  if (targets.length === 0) throw new Error('This hosted use does not have any available images.')
  return targets
}

export function copyrightNoticeTargetKey(target: CopyrightNoticeTargetInput): string {
  let ownerId: string
  switch (target.surface) {
    case 'post-image':
      ownerId = target.post_id
      break
    case 'user-profile-image':
      ownerId = target.user_id
      break
    case 'user-profile-link-image':
      ownerId = target.user_profile_link_id
      break
    case 'topic-logo-image':
    case 'topic-hero-image':
      ownerId = target.topic_id
      break
    case 'community-profile-image':
    case 'community-banner-image':
      ownerId = target.community_id
      break
  }
  return `${target.surface}:${ownerId}:${target.image_id}`
}

export function copyrightNoticeTargetInput(
  target: CopyrightNoticeResolvedTarget,
): CopyrightNoticeTargetInput {
  const common = { image_id: target.image_id, target_url: target.target_url }
  switch (target.surface) {
    case 'post-image':
      return { ...common, surface: target.surface, post_id: target.post_id }
    case 'user-profile-image':
      return { ...common, surface: target.surface, user_id: target.user_id }
    case 'user-profile-link-image':
      return {
        ...common,
        surface: target.surface,
        user_profile_link_id: target.user_profile_link_id,
      }
    case 'topic-logo-image':
    case 'topic-hero-image':
      return { ...common, surface: target.surface, topic_id: target.topic_id }
    case 'community-profile-image':
    case 'community-banner-image':
      return { ...common, surface: target.surface, community_id: target.community_id }
  }
}
