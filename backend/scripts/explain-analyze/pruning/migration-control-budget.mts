/** The control's own wall-clock bound, not a job timeout; the 3-minute step timeout still caps it. */
export const migrationControlDeadlineMs = 45_000
// The canonical wrapper may spend ten seconds on TERM before it kills the group.
const wrapperTermAllowanceMs = 10_000
const launchHeadroomMs = 500
// DROP and its absence check, held back from every command that runs before cleanup.
const cleanupReserveMs = 12_000

/**
 * Whole seconds a bounded command may run. Below one second there is no safe launch, and the
 * caller retains the owned sibling instead of starting the command.
 */
export function migrationCommandSeconds(remainingMs: number, cleaning: boolean): number {
  const reserved = wrapperTermAllowanceMs + launchHeadroomMs + (cleaning ? 0 : cleanupReserveMs)
  return Math.floor((remainingMs - reserved) / 1000)
}
