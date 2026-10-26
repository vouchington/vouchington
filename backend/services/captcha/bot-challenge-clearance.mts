import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { TimeUnit } from '@valkey/valkey-glide'

export function getBotChallengeClearanceKey(sessionId: string): string {
  return `bot-challenge-clearance:session:${sessionId}`
}

export async function hasBotChallengeClearance(sessionId: string): Promise<boolean> {
  return (await sessionValkeyClient.get(getBotChallengeClearanceKey(sessionId))) !== null
}

export async function recordBotChallengeClearance(
  sessionId: string,
  windowSeconds: number,
): Promise<void> {
  await sessionValkeyClient.set(getBotChallengeClearanceKey(sessionId), '1', {
    expiry: { type: TimeUnit.Seconds, count: windowSeconds },
  })
}
