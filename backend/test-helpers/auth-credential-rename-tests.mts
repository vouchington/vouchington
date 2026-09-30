/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { expect, test } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import type { PrivateUser } from '../services/users/types.mts'

const NAME_LENGTH_MESSAGE = 'name must be 1–100 characters'

type InsertedCredential = { id: string }

type RenameFixture = {
  getUser: () => PrivateUser
  insertCredential: (userId: string, suffix: string) => Promise<InsertedCredential>
  suffix: () => string
}

type PasskeyRenameTests = RenameFixture & {
  pathPrefix: '/api/v1/auth/passkeys'
  renamedName: 'Renamed'
}

type TotpRenameTests = RenameFixture & {
  pathPrefix: '/api/v1/auth/totp'
  renamedName: 'Renamed App'
}

async function authedRequest(user: PrivateUser) {
  const req = createRequest()
  await req.authenticateAs(user)
  return req
}

async function invalidNameResponses(
  pathPrefix: PasskeyRenameTests['pathPrefix'] | TotpRenameTests['pathPrefix'],
  user: PrivateUser,
) {
  const req = await authedRequest(user)
  const emptyName = await req.patch(`${pathPrefix}/${v7()}`).send({ name: '   ' }).expect(422)
  const tooLong = await req
    .patch(`${pathPrefix}/${v7()}`)
    .send({ name: 'x'.repeat(101) })
    .expect(422)
  return { emptyName, tooLong }
}

async function renamedCredential(options: {
  pathPrefix: PasskeyRenameTests['pathPrefix'] | TotpRenameTests['pathPrefix']
  user: PrivateUser
  insertCredential: RenameFixture['insertCredential']
  suffix: string
  renamedName: PasskeyRenameTests['renamedName'] | TotpRenameTests['renamedName']
}) {
  const credential = await options.insertCredential(options.user.id, options.suffix)
  const req = await authedRequest(options.user)
  await req
    .patch(`${options.pathPrefix}/${credential.id}`)
    .send({ name: options.renamedName })
    .expect(204)
  const listRes = await req.get(options.pathPrefix).expect(200)
  const found = listRes.body.results.find((row: { id: string }) => row.id === credential.id)
  return found?.name
}

function registerPasskeyRenameTests(options: PasskeyRenameTests): void {
  const { getUser, pathPrefix, insertCredential, suffix, renamedName } = options

  test('returns 401 without auth', async () => {
    await createRequest().patch(`${pathPrefix}/${v7()}`).send({ name: 'New Name' }).expect(401)
  })

  test('returns 415 for non-JSON content type', async () => {
    await (
      await authedRequest(getUser())
    )
      .patch(`${pathPrefix}/${v7()}`)
      .set('Content-Type', 'text/plain')
      .send('not json')
      .expect(415)
  })

  test('returns 422 for invalid name', async () => {
    const { emptyName, tooLong } = await invalidNameResponses(pathPrefix, getUser())
    expect(emptyName.body.message).toContain(NAME_LENGTH_MESSAGE)
    expect(tooLong.body.message).toContain(NAME_LENGTH_MESSAGE)
  })

  test('returns 404 for non-existent passkey', async () => {
    await (
      await authedRequest(getUser())
    )
      .patch(`${pathPrefix}/${v7()}`)
      .send({ name: 'New Name' })
      .expect(404)
  })

  test('renames a passkey and returns 204', async () => {
    const user = getUser()
    expect(
      await renamedCredential({
        pathPrefix,
        user,
        insertCredential,
        suffix: suffix(),
        renamedName,
      }),
    ).toBe(renamedName)
  })
}

function registerTotpRenameTests(options: TotpRenameTests): void {
  const { getUser, pathPrefix, insertCredential, suffix, renamedName } = options

  test('returns 401 without auth', async () => {
    await createRequest().patch(`${pathPrefix}/${v7()}`).send({ name: 'New Name' }).expect(401)
  })

  test('returns 415 without JSON content-type', async () => {
    await (
      await authedRequest(getUser())
    )
      .patch(`${pathPrefix}/${v7()}`)
      .set('Content-Type', 'text/plain')
      .send('not json')
      .expect(415)
  })

  test('returns 422 for empty or too-long name', async () => {
    const { emptyName, tooLong } = await invalidNameResponses(pathPrefix, getUser())
    expect(emptyName.body.message).toContain(NAME_LENGTH_MESSAGE)
    expect(tooLong.body.message).toContain(NAME_LENGTH_MESSAGE)
  })

  test('returns 404 for non-existent authenticator', async () => {
    await (
      await authedRequest(getUser())
    )
      .patch(`${pathPrefix}/${v7()}`)
      .send({ name: 'New Name' })
      .expect(404)
  })

  test('renames the authenticator and returns 204', async () => {
    const user = getUser()
    expect(
      await renamedCredential({
        pathPrefix,
        user,
        insertCredential,
        suffix: suffix(),
        renamedName,
      }),
    ).toBe(renamedName)
  })
}

/** Shared passkey and TOTP PATCH rename cases. Call from a literal `describe`. */
export function registerAuthCredentialRenameTests(
  options: PasskeyRenameTests | TotpRenameTests,
): void {
  if (options.pathPrefix === '/api/v1/auth/passkeys') {
    registerPasskeyRenameTests(options)
    return
  }
  registerTotpRenameTests(options)
}
