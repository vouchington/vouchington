export const USER_DELETION_BATCH_SIZE = 100

export const USER_DELETION_PHASES = [
  'posts',
  'votes',
  'user-relations',
  'credentials',
  'account-data',
  'relation-impacts',
  'external-work',
  'finalize',
] as const

export type UserDeletionPhase = (typeof USER_DELETION_PHASES)[number]

export function getNextUserDeletionPhase(phase: UserDeletionPhase): UserDeletionPhase | null {
  const index = USER_DELETION_PHASES.indexOf(phase)
  return USER_DELETION_PHASES[index + 1] ?? null
}

export function isUserDeletionPhase(value: string): value is UserDeletionPhase {
  return USER_DELETION_PHASES.includes(value as UserDeletionPhase)
}
