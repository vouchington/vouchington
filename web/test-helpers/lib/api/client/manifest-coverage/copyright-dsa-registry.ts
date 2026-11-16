import type { ManifestEndpoint } from './endpoint-registry'

export const copyrightDsaEndpointRegistry: Record<string, ManifestEndpoint> = {
  'native.copyright.staff-queue.ai-run': {
    method: 'GET',
    path: '/api/v1/copyright-notices/review-queue',
  },
  'copyright.dsa-statement.replay': {
    method: 'POST',
    path: '/api/v1/copyright-dsa-statement-submissions/00000000-0000-7000-8000-000000001221/replays',
  },
}
