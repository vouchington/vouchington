import { invalidClientMetadata, validateClientName } from '@vouchington/oauth-server'
import { remove as removeConfusables } from 'confusables'

export function validateOAuthAppName(value: unknown): string {
  const name = validateClientName(value)
  const skeleton = removeConfusables(name.normalize('NFKC'))
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  if (skeleton.includes('voucha')) {
    throw invalidClientMetadata('client_name is reserved')
  }
  return name
}
