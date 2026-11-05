import { getPublicUserByAny } from '@services/users'

const OFFICIAL_USERNAME = 'voucha'

let officialUserId: string | null = null

/** The @voucha official account id; queries compare ids, never the username. */
export async function getOfficialAccountId(): Promise<string | null> {
  if (officialUserId) return officialUserId
  const user = await getPublicUserByAny(OFFICIAL_USERNAME)
  officialUserId = user?.id ?? null
  return officialUserId
}
