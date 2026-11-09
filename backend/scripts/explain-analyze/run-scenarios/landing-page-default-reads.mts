import {
  listLandingPagesForUser,
  listLandingPagesForUserPage,
} from '@services/my/landing-pages/list'
import { getPublicLandingPage } from '@services/my/landing-pages/public'
import { getLandingPageRowByUsernameAndSlug } from '@services/my/landing-pages/reads'

/** Capture the bounded default projections through every owner/public read shape. */
export async function runLandingPageDefaultReadProbes(
  userId: string,
  username: string,
): Promise<void> {
  await Promise.all([
    listLandingPagesForUser(userId),
    listLandingPagesForUserPage(userId, { limit: 2 }),
    getPublicLandingPage(username),
    getLandingPageRowByUsernameAndSlug(username, 'first'),
  ])
}
