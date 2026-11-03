import type { ModerationActorSummary } from '@/types/appeals'

export function actorLabel(actor: ModerationActorSummary, deletedUserLabel: string): string {
  return actor.verified_display_name ?? actor.username ?? deletedUserLabel
}
