import { describe, it } from 'vitest'

import { registerWorkerServe } from '../serve-runtime.mts'
import {
  ioWorkerServeCases,
  sharedWorkerServeCases,
} from '../../../test-helpers/entrypoints/worker-serve-cases.mts'

const assertions = {
  expect: (run: () => void | Promise<void>) => run(),
}

describe('worker-io serve entrypoint', () => {
  it.each(sharedWorkerServeCases(registerWorkerServe))('$title', ({ run }) =>
    assertions.expect(run),
  )
  it.each(ioWorkerServeCases(registerWorkerServe))('$title', ({ run }) => assertions.expect(run))
})
