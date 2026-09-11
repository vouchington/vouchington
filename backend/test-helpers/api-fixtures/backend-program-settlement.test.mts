import { describe, expect, it } from 'vitest'

import {
  MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS,
  settleBackendProgramBuild,
} from './backend-program-settlement.mts'

describe('bounded backend-program settlement', () => {
  it('returns an immediately confirmed build', () => {
    const result = settleBackendProgramBuild(
      { revision: 1 },
      {
        buildAttempt: configuration => `build-${configuration.revision}`,
        confirmAttempt: configuration => ({ configuration, settled: true }),
      },
    )

    expect(result).toBe('build-1')
  })

  it('rebuilds from the latest confirmed configuration after a stale build', () => {
    const builtFrom: number[] = []
    const confirmations = [
      { configuration: { revision: 2 }, settled: false },
      { configuration: { revision: 3 }, settled: true },
    ]
    const result = settleBackendProgramBuild(
      { revision: 1 },
      {
        buildAttempt: configuration => {
          builtFrom.push(configuration.revision)
          return `build-${configuration.revision}`
        },
        confirmAttempt: () => confirmations.shift()!,
      },
    )

    expect(builtFrom).toEqual([1, 2])
    expect(result).toBe('build-2')
  })

  it('confirms a successful build on the final permitted attempt', () => {
    const events: string[] = []
    const result = settleBackendProgramBuild('initial', {
      buildAttempt: configuration => {
        events.push(`build:${configuration}`)
        return `candidate:${configuration}`
      },
      confirmAttempt: (configuration, _value) => {
        events.push(`confirm:${configuration}`)
        return {
          configuration: `${configuration}.next`,
          settled: configuration === 'initial.next.next',
        }
      },
    })

    expect(result).toBe('candidate:initial.next.next')
    expect(events).toEqual([
      'build:initial',
      'confirm:initial',
      'build:initial.next',
      'confirm:initial.next',
      'build:initial.next.next',
      'confirm:initial.next.next',
    ])
  })

  it('stops after exactly three stale builds with the exact terminal error', () => {
    let builds = 0
    const terminal = new Error(
      `Backend TypeScript inputs changed during ${MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS} consecutive program builds`,
    )

    expect(() =>
      settleBackendProgramBuild(0, {
        buildAttempt: configuration => {
          builds += 1
          return configuration
        },
        confirmAttempt: configuration => ({ configuration: configuration + 1, settled: false }),
      }),
    ).toThrow(terminal)
    expect(builds).toBe(MAXIMUM_BACKEND_PROGRAM_BUILD_ATTEMPTS)
  })

  it('propagates build and confirmation errors', () => {
    const buildError = new Error('build failed')
    const confirmationError = new Error('confirmation failed')

    expect(() =>
      settleBackendProgramBuild('initial', {
        buildAttempt: () => {
          throw buildError
        },
        confirmAttempt: () => ({ configuration: 'unreachable', settled: true }),
      }),
    ).toThrow(buildError)
    expect(() =>
      settleBackendProgramBuild('initial', {
        buildAttempt: configuration => configuration,
        confirmAttempt: () => {
          throw confirmationError
        },
      }),
    ).toThrow(confirmationError)
  })
})
