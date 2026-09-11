import { nativeStaffSupportContactApiFixtureCases } from './native-staff-support-contact-cases.mts'
import { nativeStaffSupportMessageApiFixtureCases } from './native-staff-support-message-cases.mts'
import { nativeStaffSupportThreadApiFixtureCases } from './native-staff-support-thread-cases.mts'
import type { ApiFixtureCase } from './types.mts'

export const nativeStaffSupportApiFixtureCases: ApiFixtureCase[] = [
  ...nativeStaffSupportThreadApiFixtureCases,
  ...nativeStaffSupportMessageApiFixtureCases,
  ...nativeStaffSupportContactApiFixtureCases,
]
