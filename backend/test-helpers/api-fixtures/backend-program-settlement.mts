import { settleBuild } from 'vouchington-tooling/compiler-build'

export const MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS = 3

type SettlementConfirmation<Configuration> = {
  configuration: Configuration
  settled: boolean
}

type SettlementCallbacks<Configuration, Value> = {
  buildAttempt(configuration: Configuration): Value
  confirmAttempt(configuration: Configuration, value: Value): SettlementConfirmation<Configuration>
}

/** Vouchington's fixed rebuild bound and operator-facing terminal error. */
export function settleBackendProgramBuild<Configuration, Value>(
  initialConfiguration: Configuration,
  callbacks: SettlementCallbacks<Configuration, Value>,
): Value {
  try {
    return settleBuild(initialConfiguration, MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS, callbacks)
  } catch (err) {
    if (
      err instanceof Error &&
      err.message ===
        `Inputs changed during ${MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS} consecutive build attempts`
    ) {
      throw new Error(
        `Backend TypeScript inputs changed during ${MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS} consecutive program builds`,
        { cause: err },
      )
    }
    throw err
  }
}
