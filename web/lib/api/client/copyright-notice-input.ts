type CopyrightNoticeTargetFields = { image_id: string; target_url: string }

export type CopyrightNoticeTargetInput =
  | (CopyrightNoticeTargetFields & { surface: 'post-image'; post_id: string })
  | (CopyrightNoticeTargetFields & { surface: 'user-profile-image'; user_id: string })
  | (CopyrightNoticeTargetFields & {
      surface: 'user-profile-link-image'
      user_profile_link_id: string
    })
  | (CopyrightNoticeTargetFields & {
      surface: 'topic-logo-image' | 'topic-hero-image'
      topic_id: string
    })
  | (CopyrightNoticeTargetFields & {
      surface: 'community-profile-image' | 'community-banner-image'
      community_id: string
    })
