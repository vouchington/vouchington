import { createProfilePageJsonLd } from '@vouchington/utils/json-ld'
import { buildAbsoluteUrl } from './constants'

export function createProfilePageSchema(
  input: Parameters<typeof createProfilePageJsonLd>[1],
): Record<string, unknown> {
  return createProfilePageJsonLd({ absoluteUrl: buildAbsoluteUrl }, input)
}
