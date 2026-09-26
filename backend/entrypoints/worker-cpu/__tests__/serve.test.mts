import { describe, it } from 'vitest'

import { registerWorkerServe } from '../serve-runtime.mts'
import {
  cpuWorkerServeCases,
  sharedWorkerServeCases,
} from '../../../test-helpers/entrypoints/worker-serve-cases.mts'

const assertions = {
  expect: (run: () => void | Promise<void>) => run(),
}

describe('worker-cpu serve entrypoint', () => {
  it.each(sharedWorkerServeCases(registerWorkerServe))('$title', ({ run }) =>
    assertions.expect(run),
  )
  it.each(cpuWorkerServeCases(registerWorkerServe))('$title', ({ run }) => assertions.expect(run))
})
