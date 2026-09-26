import { ACCOUNT_DECLARATIONS } from './account'
import { BOOKMARKS_DECLARATIONS } from './bookmarks'
import { CARDS_DECLARATIONS } from './cards'
import { COPYRIGHT_DECLARATIONS } from './copyright'
import { COMMUNITIES_CORE_DECLARATIONS } from './communities-core'
import { COMMUNITY_AUTOMATION_DECLARATIONS } from './community-automation'
import { COMMUNITY_LISTS_MODERATION_DECLARATIONS } from './community-lists-moderation'
import { CONTENT_REFERRALS_DECLARATIONS } from './content-referrals'
import { DYNAMIC_CONFIG_DECLARATIONS } from './dynamic-config'
import { ENGINEERING_DECLARATIONS } from './engineering'
import { ENTITY_RELATIONS_DECLARATIONS } from './entity-relations'
import { FRIEND_RECOMMENDATIONS_DECLARATIONS } from './friend-recommendations'
import { HOUSEHOLDS_AND_MEMBERSHIPS_DECLARATIONS } from './households-and-memberships'
import { IMPORT_EXPORT_DECLARATIONS } from './import-export'
import { MEDIA_PLACEMENT_DECLARATIONS } from './media-placements'
import { MODERATION_TRANSPARENCY_DECLARATIONS } from './moderation-transparency'
import { OAUTH_MANAGEMENT_DECLARATIONS } from './oauth-management'
import { PLATFORM_CORE_DECLARATIONS } from './platform-core'
import { POINT_VALUATIONS_DECLARATIONS } from './point-valuations'
import { REWARDS_STATUSES_DECLARATIONS } from './rewards-statuses'
import { SPENDING_CATEGORIES_DECLARATIONS } from './spending-categories'
import type { WebApiFixtureDeclaration } from './declaration'

export const WEB_API_FIXTURE_DECLARATIONS = [
  ...ACCOUNT_DECLARATIONS,
  ...BOOKMARKS_DECLARATIONS,
  ...CARDS_DECLARATIONS,
  ...COPYRIGHT_DECLARATIONS,
  ...COMMUNITIES_CORE_DECLARATIONS,
  ...COMMUNITY_AUTOMATION_DECLARATIONS,
  ...COMMUNITY_LISTS_MODERATION_DECLARATIONS,
  ...CONTENT_REFERRALS_DECLARATIONS,
  ...DYNAMIC_CONFIG_DECLARATIONS,
  ...ENGINEERING_DECLARATIONS,
  ...ENTITY_RELATIONS_DECLARATIONS,
  ...FRIEND_RECOMMENDATIONS_DECLARATIONS,
  ...HOUSEHOLDS_AND_MEMBERSHIPS_DECLARATIONS,
  ...IMPORT_EXPORT_DECLARATIONS,
  ...MEDIA_PLACEMENT_DECLARATIONS,
  ...MODERATION_TRANSPARENCY_DECLARATIONS,
  ...OAUTH_MANAGEMENT_DECLARATIONS,
  ...PLATFORM_CORE_DECLARATIONS,
  ...POINT_VALUATIONS_DECLARATIONS,
  ...REWARDS_STATUSES_DECLARATIONS,
  ...SPENDING_CATEGORIES_DECLARATIONS,
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]

type WebApiFixtureDeclarationUnion = (typeof WEB_API_FIXTURE_DECLARATIONS)[number]

export type WebApiFixtureId = WebApiFixtureDeclarationUnion['id']
export type WebApiFixtureBody<Id extends WebApiFixtureId> = Extract<
  WebApiFixtureDeclarationUnion,
  { readonly id: Id }
>['body']

type DeclarationIndex<Declarations extends readonly WebApiFixtureDeclaration<string, unknown>[]> = {
  readonly [Id in Declarations[number]['id']]: Extract<Declarations[number], { readonly id: Id }>
}

export function indexWebApiFixtureDeclarations<
  const Declarations extends readonly WebApiFixtureDeclaration<string, unknown>[],
>(declarations: Declarations): DeclarationIndex<Declarations> {
  const index: Record<string, WebApiFixtureDeclaration<string, unknown>> = Object.create(null)
  const declarationIndices: Record<string, number> = Object.create(null)
  for (const [declarationIndex, declaration] of declarations.entries()) {
    if (Object.hasOwn(index, declaration.id)) {
      throw new Error(
        `Duplicate web API fixture declaration: ${declaration.id} at indices ${declarationIndices[declaration.id]} and ${declarationIndex}`,
      )
    }
    index[declaration.id] = declaration
    declarationIndices[declaration.id] = declarationIndex
  }
  return Object.freeze(index) as DeclarationIndex<Declarations>
}
