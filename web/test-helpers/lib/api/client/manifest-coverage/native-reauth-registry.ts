import { endpoint, type ManifestEndpoint } from './endpoint-registry'

export const nativeReAuthEndpointRegistry = {
  'native.auth.re-auth.methods.default': endpoint('/api/v1/auth/re-auth/methods'),
  'native.auth.re-auth.email.tokens': {
    method: 'POST',
    path: '/api/v1/auth/mfa/re-auth/email/tokens',
  },
  'native.auth.re-auth.email.verification': {
    method: 'POST',
    path: '/api/v1/auth/mfa/re-auth/email/verification',
    requestBody: { code: 'ABCDEFGHJK' },
  },
  'native.auth.re-auth.totp.verification': {
    method: 'POST',
    path: '/api/v1/auth/mfa/re-auth/totp/verification',
    requestBody: { code: '123456' },
  },
  'native.auth.re-auth.passkeys.options': {
    method: 'POST',
    path: '/api/v1/auth/re-auth/passkeys/options',
    requestBody: { passkey_id: '00000000-0000-7000-8000-000000000741' },
  },
  'native.auth.re-auth.passkeys.verification': {
    method: 'POST',
    path: '/api/v1/auth/re-auth/passkeys/verification',
    requestBody: {
      flow_id: '00000000-0000-7000-8000-000000000742',
      passkey_id: '00000000-0000-7000-8000-000000000741',
      response: {
        clientExtensionResults: {},
        id: 'dm91Y2hhLXN5bnRoZXRpYy1wYXNza2V5LWNyZWRlbnRpYWw',
        rawId: 'dm91Y2hhLXN5bnRoZXRpYy1wYXNza2V5LWNyZWRlbnRpYWw',
        response: {
          authenticatorData: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ',
          clientDataJSON:
            'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoiUWtKQ1FrSkNRa0pDUWtKQ1FrSkNRa0pDUWtKQ1FrSkNRa0pDUWtKQ1FrSSIsIm9yaWdpbiI6Imh0dHBzOi8vdm91Y2hhLmFpIn0',
          signature:
            'AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg',
        },
        type: 'public-key',
      },
    },
  },
  'native.auth.re-auth.providers.challenge.google': {
    method: 'POST',
    path: '/api/v1/auth/re-auth/providers/google/challenges',
  },
  'native.auth.re-auth.providers.verification.google': {
    method: 'POST',
    path: '/api/v1/auth/re-auth/providers/google/verification',
    requestBody: {
      credential: 'fixture-provider-credential',
      flow_id: '00000000-0000-7000-8000-000000000742',
    },
  },
  'native.auth.re-auth.providers.authorization.github': {
    method: 'POST',
    path: '/api/v1/auth/re-auth/providers/github/authorizations',
    requestBody: {
      callback_mode: 'native',
      completion_proof_challenge: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
    },
  },
  'native.auth.re-auth.providers.proof.github': {
    method: 'POST',
    path: '/api/v1/auth/re-auth/providers/github/proofs',
    requestBody: { flow_id: '00000000-0000-7000-8000-000000000742' },
  },
  'native.auth.session.refresh.rotated': {
    method: 'PATCH',
    path: '/api/v1/session',
    requestHeaders: {
      'Content-Type': 'application/json',
      'x-voucha-app-version': 'test',
      'x-voucha-client': 'dotnet',
      'x-voucha-platform': 'windows',
    },
    requestBody: { dt: 'fixture-previous-device-jwt', st: 'fixture-previous-session-jwt' },
  },
  'native.bot-challenge.required': {
    method: 'POST',
    path: '/api/v1/rss-feed-items/00000000-0000-7000-8000-000000000743/shares',
  },
} satisfies Record<string, ManifestEndpoint>
