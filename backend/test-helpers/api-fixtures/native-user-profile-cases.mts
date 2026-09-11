import { nativeUserProfileCollectionApiFixtureCases } from './native-user-profile-collection-cases.mts'
import { nativeUserProfileHeaderApiFixtureCases } from './native-user-profile-header-cases.mts'
import { nativeUserProfilePostApiFixtureCases } from './native-user-profile-post-cases.mts'
import type { ApiFixtureCase } from './types.mts'

export const nativeUserProfileApiFixtureCases: ApiFixtureCase[] = [
  ...nativeUserProfileHeaderApiFixtureCases,
  ...nativeUserProfilePostApiFixtureCases,
  ...nativeUserProfileCollectionApiFixtureCases,
]
