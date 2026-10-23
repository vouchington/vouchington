import { getPasskeyReAuthOptions, verifyPasskeyReAuth } from '@services/passkeys'
import { v7 as uuidv7 } from 'uuid'
import { withActiveAccountSession } from './active-account-session.mts'
import { createReAuthToken } from './re-auth.mts'

type ReAuthSession = { deviceId: string; sessionId: string; passkeyId: string }

export async function beginPasskeyReAuth(currentUserId: string, session: ReAuthSession) {
  const flowId = uuidv7()
  return withActiveAccountSession(
    currentUserId,
    { sid: session.sessionId, did: session.deviceId },
    async query => {
      const options = await getPasskeyReAuthOptions(currentUserId, session.deviceId, {
        sessionId: session.sessionId,
        flowId,
        passkeyId: session.passkeyId,
        query,
      })
      return { flow_id: flowId, options }
    },
  )
}

/** A fresh hardware assertion grants an account-change proof, without changing session MFA. */
export async function completePasskeyReAuth(
  currentUserId: string,
  session: ReAuthSession & { flowId: string; expectedOrigin: string; response: unknown },
): Promise<string> {
  return withActiveAccountSession(
    currentUserId,
    { sid: session.sessionId, did: session.deviceId },
    async query => {
      await verifyPasskeyReAuth(
        currentUserId,
        session.deviceId,
        session.expectedOrigin,
        session.response,
        {
          sessionId: session.sessionId,
          flowId: session.flowId,
          passkeyId: session.passkeyId,
          query,
        },
      )
      return createReAuthToken(
        currentUserId,
        { sid: session.sessionId, did: session.deviceId },
        query,
      )
    },
  )
}
