const MAX_WAKE_SECONDS = 3600

/** The wake runs only on staging, whose Aurora cluster auto-pauses. */
export function assertStagingAuroraWakeAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ENVIRONMENT !== 'staging') {
    throw new Error('staging aurora wake guard')
  }
}

/** Reads the required `<seconds>` argument: a positive integer of at most one hour. */
export function parseStagingAuroraWakeSeconds(args: readonly string[]): number {
  const [value, ...extra] = args
  if (value === undefined || extra.length > 0 || !/^[1-9]\d{0,9}$/.test(value)) {
    throw new Error(
      `staging aurora wake needs one <seconds> argument from 1 to ${MAX_WAKE_SECONDS}`,
    )
  }
  const seconds = Number(value)
  if (seconds > MAX_WAKE_SECONDS) {
    throw new Error(`staging aurora wake <seconds> is at most ${MAX_WAKE_SECONDS}, got ${seconds}`)
  }
  return seconds
}
