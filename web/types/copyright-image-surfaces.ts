export type CopyrightImageSurface =
  | 'post-image'
  | 'user-profile-image'
  | 'user-profile-link-image'
  | 'topic-logo-image'
  | 'topic-hero-image'
  | 'community-profile-image'
  | 'community-banner-image'

export function copyrightImageSurfaceLabel(surface: CopyrightImageSurface): string {
  switch (surface) {
    case 'post-image':
      return 'Post image'
    case 'user-profile-image':
      return 'Profile image'
    case 'user-profile-link-image':
      return 'Profile link image'
    case 'topic-logo-image':
      return 'Topic logo'
    case 'topic-hero-image':
      return 'Topic hero image'
    case 'community-profile-image':
      return 'Community profile image'
    case 'community-banner-image':
      return 'Community banner image'
  }
}
