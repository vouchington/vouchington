import { DynamicConfig } from '@data-stores/valkey'

export const BOT_CHALLENGE_CLEARANCE_DEFAULT_SECONDS = 300
export const BOT_CHALLENGE_CLEARANCE_MAX_SECONDS = 3600

export const botChallengeConfig = new DynamicConfig({
  key: 'bot-challenge-config',
  fieldTypes: { clearance_seconds: 'number' },
  defaultFields: { clearance_seconds: BOT_CHALLENGE_CLEARANCE_DEFAULT_SECONDS },
})

export function getBotChallengeClearanceSeconds(): number {
  const value: unknown = botChallengeConfig.fields.get('clearance_seconds')
  if (value === undefined) return BOT_CHALLENGE_CLEARANCE_DEFAULT_SECONDS
  // Invalid stored values must require a challenge, even if an earlier clearance remains.
  if (!Number.isInteger(value) || typeof value !== 'number') return 0
  return value >= 0 && value <= BOT_CHALLENGE_CLEARANCE_MAX_SECONDS ? value : 0
}
