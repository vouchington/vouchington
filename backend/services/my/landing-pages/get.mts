import { getLandingPageRowById, getLandingPageRowForUser } from './reads.mts'
import { resolveLandingPageWithItems } from './resolve-items.mts'
import type { LandingPageWithItems } from './types.mts'

export async function getMyLandingPage(
  userId: string,
  pageId: string,
): Promise<LandingPageWithItems> {
  const page = await getLandingPageRowForUser(userId, pageId)
  return resolveLandingPageWithItems(page)
}

export async function getLandingPageById(pageId: string): Promise<LandingPageWithItems> {
  const page = await getLandingPageRowById(pageId)
  return resolveLandingPageWithItems(page)
}
