import type { CopyrightNoticeResolvedTarget } from '@/lib/api/client/copyright-notice-targets'

/** The territorial decision API accepts hosted post images only. */
export function copyrightStaffPostImageChoices(targets: CopyrightNoticeResolvedTarget[]) {
  return targets.filter(target => target.surface === 'post-image')
}
