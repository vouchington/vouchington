import { hashToken } from '@modules/token-secrets'

const STATE_HASH_PURPOSE = 'oauth-authorization-broker:state'
const COMPLETION_TOKEN_HASH_PURPOSE = 'oauth-authorization-broker:completion'

export function hashOAuthAuthorizationState(state: string): string {
  return hashToken(STATE_HASH_PURPOSE, state)
}

export function hashOAuthCompletionToken(flowId: string, token: string): string {
  return hashToken(`${COMPLETION_TOKEN_HASH_PURPOSE}:${flowId}`, token)
}

export function getPkceVerifierPurpose(flowId: string): string {
  return `oauth-authorization-broker:${flowId}:pkce-verifier`
}

export function getCallbackCodePurpose(flowId: string): string {
  return `oauth-authorization-broker:${flowId}:callback-code`
}

export function getCompletionTokenPurpose(flowId: string): string {
  return `oauth-authorization-broker:${flowId}:completion-token`
}
