'use client'

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { CopyrightNoticeResolvedTarget } from '@/lib/api/client/copyright-notice-targets'
import {
  approvalTargetFields,
  type CopyrightEmailApprovalDraft,
  type CopyrightEmailApprovalTarget,
} from './copyright-email-approval-model'
import { createPostPathname, topicHref, userHref } from '@/lib/links/entity-href'
import { getPostSlugFromType } from '@/lib/route-configs'
import { fetchPost } from '@/lib/api/client/posts'
import { fetchTopic } from '@/lib/api/client/topics'
import { fetchUser } from '@/lib/api/client/users'
import onError from '@/lib/on-error'

export function useCopyrightEmailApprovalOwnerSelection(
  target: CopyrightEmailApprovalTarget,
  onChange: Dispatch<SetStateAction<CopyrightEmailApprovalDraft>>,
) {
  const [ownerLabel, setOwnerLabel] = useState('')
  const [choices, setChoices] = useState<CopyrightNoticeResolvedTarget[]>([])
  const [ownerUrl, setOwnerUrl] = useState('')
  const selectionRequest = useRef(0)
  useEffect(
    () => () => {
      selectionRequest.current++
    },
    [],
  )

  function update(changes: Partial<CopyrightEmailApprovalTarget>) {
    onChange(current => ({
      ...current,
      targets: current.targets.map(item =>
        item.id === target.id ? { ...item, ...changes } : item,
      ),
    }))
  }

  function selectOwner(
    key: 'post_id' | 'user_id' | 'topic_id' | 'community_id',
    id: string,
    label: string,
    pathname: string,
  ) {
    if (!id) {
      clearOwner()
      return
    }
    selectionRequest.current++
    setOwnerLabel(label)
    setOwnerUrl(new URL(pathname, window.location.origin).href)
    setChoices([])
    update({ [key]: id, image_id: '' })
  }

  function clearOwner() {
    selectionRequest.current++
    setOwnerLabel('')
    setOwnerUrl('')
    setChoices([])
    update({
      post_id: '',
      user_id: undefined,
      user_profile_link_id: undefined,
      topic_id: undefined,
      community_id: undefined,
      image_id: '',
      resolution_status: 'failed',
    })
  }

  async function selectPost(id: string, title: string) {
    const request = ++selectionRequest.current
    setOwnerLabel(title)
    setOwnerUrl('')
    setChoices([])
    update({ post_id: id, image_id: '' })
    if (!id) return
    try {
      const post = (await fetchPost(id))?.post
      if (request !== selectionRequest.current) return
      if (!post) throw new Error('Selected post is unavailable')
      setOwnerUrl(
        new URL(
          createPostPathname(getPostSlugFromType(post.post_type), post),
          window.location.origin,
        ).href,
      )
    } catch (err) {
      if (request === selectionRequest.current)
        onError(err, { fallback: 'Could not load that post.' })
    }
  }

  async function selectTopic(id: string, name: string) {
    const request = ++selectionRequest.current
    setOwnerLabel(name)
    setOwnerUrl('')
    setChoices([])
    update({ topic_id: id, image_id: '' })
    if (!id) return
    try {
      const topic = await fetchTopic(id)
      if (request !== selectionRequest.current) return
      if (!topic) throw new Error('Selected topic is unavailable')
      setOwnerUrl(new URL(topicHref(topic), window.location.origin).href)
    } catch (err) {
      if (request === selectionRequest.current)
        onError(err, { fallback: 'Could not load that topic.' })
    }
  }

  async function selectUser(id: string) {
    if (!id) {
      clearOwner()
      return
    }
    const request = ++selectionRequest.current
    setOwnerLabel('')
    setOwnerUrl('')
    setChoices([])
    try {
      const user = (await fetchUser(id))?.user
      if (request !== selectionRequest.current) return
      if (!user?.username) {
        onError(new Error('Selected account has no username'), {
          fallback: 'This account has no username to locate its hosted images.',
        })
        return
      }
      selectOwner('user_id', id, user.username, userHref(user))
    } catch (err) {
      if (request === selectionRequest.current)
        onError(err, { fallback: 'Could not load that user.' })
    }
  }

  function resetSurface(surface: CopyrightEmailApprovalTarget['surface']) {
    selectionRequest.current++
    setOwnerLabel('')
    setOwnerUrl('')
    setChoices([])
    update({
      surface,
      post_id: '',
      user_id: undefined,
      user_profile_link_id: undefined,
      topic_id: undefined,
      community_id: undefined,
      image_id: '',
      resolution_status: 'failed',
    })
  }

  function selectImage(next: CopyrightNoticeResolvedTarget[]) {
    const matching = next.filter(item => {
      if (item.surface !== target.surface || item.target_url !== ownerUrl) return false
      switch (item.surface) {
        case 'post-image':
          return item.post_id === target.post_id
        case 'user-profile-image':
          return item.user_id === target.user_id
        case 'user-profile-link-image':
          return true
        case 'topic-logo-image':
        case 'topic-hero-image':
          return item.topic_id === target.topic_id
        case 'community-profile-image':
        case 'community-banner-image':
          return item.community_id === target.community_id
      }
      return false
    })
    setChoices(matching.slice(0, 1))
    const chosen = matching[0]
    if (chosen) {
      // The parent resolves this canonical URL into its displayed image choices.
      update({ ...approvalTargetFields(chosen), resolution_status: 'pending' })
    } else {
      update({ image_id: '', resolution_status: 'failed' })
    }
  }

  return {
    ownerLabel,
    ownerUrl,
    choices,
    selectOwner,
    clearOwner,
    selectPost,
    selectTopic,
    selectUser,
    selectImage,
    resetSurface,
  }
}
