import type { ManifestEndpoint } from './endpoint-registry'

export const copyrightDsaEndpointRegistry: Record<string, ManifestEndpoint> = {
  'copyright.dsa-statement.replay': {
    method: 'POST',
    path: '/api/v1/copyright-dsa-statement-submissions/00000000-0000-7000-8000-000000001221/replays',
  },
}
