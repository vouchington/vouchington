export type CopyrightImageSurface =
  | 'post-image'
  | 'user-profile-image'
  | 'user-profile-link-image'
  | 'topic-logo-image'
  | 'topic-hero-image'
  | 'community-profile-image'
  | 'community-banner-image'

export function copyrightImageSurfaceLabel(surface: CopyrightImageSurface): string {
  return {
    __proto__: null,
    'post-image': 'Post image',
    'user-profile-image': 'Profile image',
    'user-profile-link-image': 'Profile link image',
    'topic-logo-image': 'Topic logo',
    'topic-hero-image': 'Topic hero image',
    'community-profile-image': 'Community profile image',
    'community-banner-image': 'Community banner image',
  }[surface]
}
