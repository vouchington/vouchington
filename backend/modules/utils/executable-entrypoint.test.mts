import { describe, expect, it } from 'vitest'
import { selectExecutableEntrypoint } from './executable-entrypoint.mts'

const entrypoints = ['migrate.mts', 'serve.mts', 'valkey-admin.mts']

describe('selectExecutableEntrypoint', () => {
  it('selects the entrypoint named first and keeps the arguments after it', () => {
    expect(
      selectExecutableEntrypoint(['bun', '/app/api', 'valkey-admin.mts', 'diagnose'], entrypoints),
    ).toEqual({ entrypoint: 'valkey-admin.mts', argv: ['bun', '/app/api', 'diagnose'] })
  })

  it('drops the leading flags of an ECS command override', () => {
    const argv = [
      'bun',
      '/app/api',
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      'migrate.mts',
      '--forced',
    ]
    expect(selectExecutableEntrypoint(argv, entrypoints)).toEqual({
      entrypoint: 'migrate.mts',
      argv: ['bun', '/app/api', '--forced'],
    })
  })

  it('ignores an entrypoint name in the executable path positions', () => {
    expect(
      selectExecutableEntrypoint(['migrate.mts', 'serve.mts', 'valkey-admin.mts'], entrypoints),
    ).toEqual({ entrypoint: 'valkey-admin.mts', argv: ['migrate.mts', 'serve.mts'] })
  })

  it('rejects a Node eval command instead of falling back to a server', () => {
    const argv = ['bun', '/app/api', '--experimental-strip-types', '--input-type=module', '--eval']
    expect(() => selectExecutableEntrypoint([...argv, 'x'], entrypoints)).toThrow(
      /Unknown executable command "x"; expected one of: migrate\.mts, serve\.mts, valkey-admin\.mts/,
    )
  })

  it('rejects no command', () => {
    expect(() => selectExecutableEntrypoint(['bun', '/app/api'], entrypoints)).toThrow(
      'Unknown executable command (none)',
    )
    expect(() => selectExecutableEntrypoint(['bun', '/app/api', '--flag'], entrypoints)).toThrow(
      'Unknown executable command (none)',
    )
  })

  it('does not select an entrypoint that follows an unknown non-flag argument', () => {
    expect(() =>
      selectExecutableEntrypoint(['bun', '/app/api', '--flag', 'value', 'serve.mts'], entrypoints),
    ).toThrow('Unknown executable command "value"')
  })

  it('truncates a long received script in the error', () => {
    const script = 'a'.repeat(500)
    expect(() => selectExecutableEntrypoint(['bun', '/app/api', script], entrypoints)).toThrow(
      `"${'a'.repeat(80)}..."`,
    )
  })
})
