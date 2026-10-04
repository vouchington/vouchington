import {
  submitEuCopyrightRedress,
  submitUkCopyrightRedress,
} from '../services/copyright-notices/index.mts'
import {
  seedDeterminedTerritorialNotice,
  type TerritorialJurisdiction,
  type TerritorialActors,
} from './services/copyright-notices/territorial-routes.mts'

/** A determined territorial notice and the claimant's redress request against it. */
export async function seedTerritorialRedress(
  jurisdiction: TerritorialJurisdiction,
  actors: Pick<TerritorialActors, 'claimant' | 'staff'>,
): Promise<{ noticeId: string; redressId: string }> {
  const noticeId = await seedDeterminedTerritorialNotice(jurisdiction, actors)
  const redress =
    jurisdiction === 'eu_dsa'
      ? await submitEuCopyrightRedress(
          actors.claimant,
          noticeId,
          crypto.randomUUID(),
          'Please review this restriction',
        )
      : await submitUkCopyrightRedress(
          actors.claimant,
          noticeId,
          crypto.randomUUID(),
          'Please review this restriction',
        )
  return { noticeId, redressId: redress.id }
}
