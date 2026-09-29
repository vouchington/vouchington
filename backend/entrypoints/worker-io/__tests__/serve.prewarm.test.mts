import { describe, it } from 'vitest'

import { registerWorkerServe } from '../serve-runtime.mts'
import { prewarmWorkerServeCases } from '../../../test-helpers/entrypoints/worker-serve-prewarm-cases.mts'

const assertions = {
  expect: (run: () => void | Promise<void>) => run(),
}

describe('worker-io serve entrypoint (prewarm mode)', () => {
  it.each(prewarmWorkerServeCases(registerWorkerServe))('$title', ({ run }) =>
    assertions.expect(run),
  )
})
