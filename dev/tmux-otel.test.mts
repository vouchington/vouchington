import { describe, expect, it } from 'vitest'
import { makeRepo, registerTmuxFakeHooks, runTmux } from './test-helpers/tmux.mts'

describe('dev/tmux OTel preload', () => {
  const { makeFakeBin } = registerTmuxFakeHooks()

  it('preloads the OTel register hook into every Node service window only when OTEL_ENABLED=1', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()

    const off = await runTmux({ binDir, cwd })
    const on = await runTmux({ binDir, cwd, extraEnv: { OTEL_ENABLED: '1' } })

    expect(off.log).not.toContain('otel-register.mts')
    expect(on.log.match(/--import[^\n]*otel-register\.mts/g)).toHaveLength(4)
    expect(on.log).toContain('OTEL_SERVICE_NAME=voucha-web')
    expect(on.log).toContain('OTEL_SERVICE_NAME=voucha-lambdas')
  })
})
