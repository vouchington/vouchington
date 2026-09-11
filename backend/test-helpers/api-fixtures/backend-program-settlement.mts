export const MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS = 3

type SettlementConfirmation<Configuration> = {
  configuration: Configuration
  settled: boolean
}

type SettlementCallbacks<Configuration, Value> = {
  buildAttempt(configuration: Configuration): Value
  confirmAttempt(configuration: Configuration, value: Value): SettlementConfirmation<Configuration>
}

export function settleBackendProgramBuild<Configuration, Value>(
  initialConfiguration: Configuration,
  callbacks: SettlementCallbacks<Configuration, Value>,
): Value {
  let configuration = initialConfiguration
  for (let attempts = 1; attempts <= MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS; attempts += 1) {
    const value = callbacks.buildAttempt(configuration)
    const confirmation = callbacks.confirmAttempt(configuration, value)
    if (confirmation.settled) return value
    configuration = confirmation.configuration
  }
  throw new Error(
    `Backend TypeScript inputs changed during ${MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS} consecutive program builds`,
  )
}
