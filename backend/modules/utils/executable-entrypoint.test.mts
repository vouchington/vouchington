import { describe, expect, it } from 'vitest'
import { selectExecutableEntrypoint } from './executable-entrypoint.mts'

const entrypoints = ['migrate.mts', 'serve.mts', 'valkey-admin.mts']

describe('selectExecutableEntrypoint', () => {
  it('runs the fallback with unchanged arguments when no entrypoint is named', () => {
    expect(
      selectExecutableEntrypoint(['bun', '/app/api', '--port'], entrypoints, 'serve.mts'),
    ).toEqual({
      entrypoint: 'serve.mts',
      argv: ['bun', '/app/api', '--port'],
    })
  })

  it('drops the node flags of an ECS command override up to the named entrypoint', () => {
    const argv = ['bun', '/app/api', '--experimental-strip-types', 'migrate.mts', '--forced']
    expect(selectExecutableEntrypoint(argv, entrypoints, 'serve.mts')).toEqual({
      entrypoint: 'migrate.mts',
      argv: ['bun', '/app/api', '--forced'],
    })
  })

  it('ignores an entrypoint name in the executable path positions', () => {
    const argv = ['migrate.mts', 'serve.mts', 'valkey-admin.mts', 'diagnose']
    expect(selectExecutableEntrypoint(argv, entrypoints, 'serve.mts')).toEqual({
      entrypoint: 'valkey-admin.mts',
      argv: ['migrate.mts', 'serve.mts', 'diagnose'],
    })
  })
})
