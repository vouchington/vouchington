import type { OAuthAccount } from '@services/oauth-accounts'
import type { DeviceClass, DeviceContext } from '@services/jwt-session'
import type { BrokerCallbackMode, BrokerOAuthProvider, BrokerPurpose } from './broker-config.mts'
import type { OAuthFlowResult } from './flows.mts'

type AuthenticatedOAuthFlowResult = Extract<OAuthFlowResult, { mfaRequired: false }>

export type OAuthAuthorizationCompletionOptions = {
  flowId: string
  completionToken: string
  completionTokenSource: 'cookie' | 'body'
  completionProofVerifier?: string
  currentUserId?: string
  deviceId: string
  sessionId: string
  deviceClass?: DeviceClass
  deviceContext?: DeviceContext
}

export type CompletionRow = {
  id: string
  provider: BrokerOAuthProvider
  purpose: BrokerPurpose
  callback_mode: BrokerCallbackMode
  status:
    | 'pending'
    | 'callback_received'
    | 'exchanging'
    | 'completion_ready'
    | 'completed'
    | 'rejected'
    | 'expired'
  initiating_user_id: string | null
  initiating_device_id: string
  initiating_session_id: string
  completion_proof_challenge: string | null
  completion_token_hash: string | null
  callback_error: string | null
  facebook_user_id: string | null
  x_user_id: string | null
  github_user_id: string | null
  result_kind: 'authenticated' | 'mfa_required' | 'connected' | null
  result_user_id: string | null
  result_device_id: string | null
  result_session_id: string | null
  login_attempt_id: string | null
  expires_at: Date
}

export type DurableOAuthAuthorizationCompletion =
  | { kind: 'pending' }
  | {
      kind: 'connected'
      userId: string
      account: OAuthAccount
      provider: BrokerOAuthProvider
      newlyCompleted: boolean
    }
  | { kind: 'mfa_required'; userId: string; loginAttemptId: string }
  | {
      kind: 'authenticated'
      userId: string
      deviceId: string
      sessionId: string
      newlyCompleted: boolean
    }

export type StoredOAuthAuthorizationCompletion =
  | { kind: 'connected'; userId: string }
  | { kind: 'mfa_required'; userId: string; loginAttemptId: string }
  | { kind: 'authenticated'; userId: string; deviceId: string; sessionId: string }

export type PersistedOAuthAuthorizationCompletion =
  | { kind: 'connected'; userId: string }
  | { kind: 'mfa_required'; userId: string; loginAttemptId: string }
  | { kind: 'authenticated'; userId: string; deviceId: string; sessionId: string }

export type CompletedOAuthAuthorization =
  | { status: 'pending' }
  | { status: 'connected'; account: OAuthAccount; name: string }
  | {
      status: 'authenticated'
      user: AuthenticatedOAuthFlowResult['user']
      deviceToken: AuthenticatedOAuthFlowResult['deviceToken']
      sessionToken: AuthenticatedOAuthFlowResult['sessionToken']
    }
  | { status: 'mfa_required'; loginAttemptId: string }
