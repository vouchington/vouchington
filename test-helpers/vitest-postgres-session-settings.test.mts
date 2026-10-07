import { describe, expect, it } from 'vitest'
import { configureTestPostgresSessions } from './vitest-postgres-session-settings.mts'

describe('PostgreSQL test session configuration', () => {
  it('preserves connection identity and existing startup options for both pools', () => {
    const env = {
      DATABASE_URL:
        'postgres://fixture:secret@localhost/owned?options=-c%20application_name=fixture',
      READ_DATABASE_URL: 'postgres://localhost/owned_read?sslmode=disable',
    }
    configureTestPostgresSessions(env)
    const primary = new URL(env.DATABASE_URL)
    const read = new URL(env.READ_DATABASE_URL)
    expect(primary.username).toBe('fixture')
    expect(primary.password).toBe('secret')
    expect(primary.pathname).toBe('/owned')
    expect(primary.searchParams.get('options')).toContain('-c application_name=fixture')
    expect(primary.searchParams.get('options')).toContain('-c statement_timeout=')
    expect(env.DATABASE_URL).toContain('options=-c%20application_name%3Dfixture')
    expect(env.DATABASE_URL).not.toMatch(/[?&]options=[^&]*\+/u)
    expect(read.pathname).toBe('/owned_read')
    expect(read.searchParams.get('sslmode')).toBe('disable')
    expect(read.searchParams.get('options')).toContain('-c hnsw.ef_search=')
    expect(env.READ_DATABASE_URL).not.toMatch(/[?&]options=[^&]*\+/u)
  })

  it('does not grow startup options when setup is repeated', () => {
    const env = { DATABASE_URL: 'postgres://localhost/owned' }
    configureTestPostgresSessions(env)
    const once = env.DATABASE_URL
    configureTestPostgresSessions(env)
    expect(env.DATABASE_URL).toBe(once)
  })

  it('preserves literal and encoded plus signs in existing options for both pools', () => {
    const env = {
      DATABASE_URL: 'postgres://localhost/owned?options=-c%20application_name=ci+1',
      READ_DATABASE_URL: 'postgres://localhost/owned_read?options=-c%20application_name=ci%2B2',
    }
    configureTestPostgresSessions(env)
    expect(new URL(env.DATABASE_URL).searchParams.get('options')).toContain('application_name=ci+1')
    expect(new URL(env.READ_DATABASE_URL).searchParams.get('options')).toContain(
      'application_name=ci+2',
    )
    expect(env.DATABASE_URL).toContain('ci%2B1')
    expect(env.READ_DATABASE_URL).toContain('ci%2B2')
    const once = { ...env }
    configureTestPostgresSessions(env)
    expect(env).toEqual(once)
  })

  it('preserves encoded spaces in unrelated connection parameters', () => {
    const env = {
      DATABASE_URL:
        'postgres://localhost/owned?sslcert=%2Ftmp%2Fcert%20dir%2Fcert.pem&options=-c%20jit=off',
      READ_DATABASE_URL:
        'postgres://localhost/owned_read?application_name=ci%20tests&options=-c%20jit=off',
    }
    configureTestPostgresSessions(env)
    expect(env.DATABASE_URL).toContain('sslcert=%2Ftmp%2Fcert%20dir%2Fcert.pem')
    expect(env.READ_DATABASE_URL).toContain('application_name=ci%20tests')
    const once = { ...env }
    configureTestPostgresSessions(env)
    expect(env).toEqual(once)
  })

  it('extends the last effective options value when the parameter is repeated', () => {
    const env = {
      DATABASE_URL:
        'postgres://localhost/owned?options=-c%20jit%3Don&sslmode=disable&options=-c%20application_name%3Dci',
    }
    configureTestPostgresSessions(env)
    expect(env.DATABASE_URL).toContain('sslmode=disable')
    expect(env.DATABASE_URL).not.toContain('jit%3Don')
    expect(env.DATABASE_URL.match(/[?&]options=/gu)).toHaveLength(1)
    expect(new URL(env.DATABASE_URL).searchParams.get('options')).toContain('application_name=ci')
    const once = env.DATABASE_URL
    configureTestPostgresSessions(env)
    expect(env.DATABASE_URL).toBe(once)
  })

  it('preserves hostless PostgreSQL socket URLs', () => {
    const env = {
      DATABASE_URL: 'postgresql://tester@/owned?host=%2Fvar%2Frun%2Fpostgresql',
    }
    configureTestPostgresSessions(env)
    expect(env.DATABASE_URL).toMatch(
      /^postgresql:\/\/tester@\/owned\?host=%2Fvar%2Frun%2Fpostgresql&options=/u,
    )
    expect(env.DATABASE_URL).toContain('statement_timeout%3D')
    const once = env.DATABASE_URL
    configureTestPostgresSessions(env)
    expect(env.DATABASE_URL).toBe(once)
  })

  it('does not invent a connection when no database URL is present', () => {
    const env = {}
    configureTestPostgresSessions(env)
    expect(env).toEqual({})
  })
})
