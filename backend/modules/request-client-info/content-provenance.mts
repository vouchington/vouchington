import createHttpError from 'http-errors'
import type {
  ContentProvenance,
  OAuthContentCreationChannel,
} from '@voucha/types/entities/content-provenance'
import { getOptionalRequestOrigin, INVALID_CLIENT_INFO_CODE, type RequestOrigin } from './index.mts'

const CREDENTIAL_CHANNEL_BY_INTERFACE = {
  rest: 'api',
  mcp: 'mcp',
} as const satisfies Record<RequestOrigin['interface'], OAuthContentCreationChannel>

// The channel that content written during this origin records. Session requests record their
// self-asserted client (telemetry-grade), while credentialed requests record the credential's
// interface and, for OAuth, the client the token was issued to. Returns null when a session request
// has no validated client, so the caller cannot silently record an unknown client.
export function resolveContentProvenance(
  origin: Readonly<RequestOrigin>,
): ContentProvenance | null {
  if (origin.credential === 'session') {
    if (!origin.client) return null
    return { createdVia: origin.client, oauthClientId: null }
  }
  return {
    createdVia: CREDENTIAL_CHANNEL_BY_INTERFACE[origin.interface],
    oauthClientId: origin.oauthClientId,
  }
}

// Route handlers call this after authentication to classify the content they write. Queue jobs,
// seeds and scripts pass `SYSTEM_PROVENANCE` instead, so reaching this outside a request is a bug.
export function getRequestContentProvenance(): ContentProvenance {
  const origin = getOptionalRequestOrigin()
  if (!origin) throw new Error('Content provenance requested outside a request')
  const provenance = resolveContentProvenance(origin)
  if (!provenance) {
    throw createHttpError(400, 'Valid client information is required to create content', {
      code: INVALID_CLIENT_INFO_CODE,
    })
  }
  return provenance
}
