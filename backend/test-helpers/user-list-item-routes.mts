/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { beforeAll, test } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createRandomString, createTestUser } from '@voucha/test-helpers'
import type { Test } from 'supertest'
import type { PrivateUser } from '../services/users/types.mts'

const UNKNOWN_ENTITY_ID = '00000000-0000-7000-8000-000000000000'

type ListItemSegment = 'posts' | 'rss-feed-items'
type ListItemBodyKey = 'post_id' | 'rss_feed_item_id'

type SharedOptions = {
  segment: ListItemSegment
  bodyKey: ListItemBodyKey
  listNamePrefix: string
  createEntityId: (userId: string) => Promise<string>
}

type AddOptions = SharedOptions & { mode: 'add' }
type RemoveOptions = SharedOptions & { mode: 'remove' }

export type UserListItemAddRoutes = {
  entityId: () => string
  authorizedPost: () => Promise<{ sent: Test }>
}

/** Shared user-list item route cases. Call from a literal `describe`. */
export function registerUserListItemRouteTests(options: AddOptions): UserListItemAddRoutes
export function registerUserListItemRouteTests(options: RemoveOptions): void
export function registerUserListItemRouteTests(
  options: AddOptions | RemoveOptions,
): UserListItemAddRoutes | void {
  let user: PrivateUser
  let listId: string
  let entityId: string
  const collectionPath = () => `/api/v1/lists/${listId}/items/${options.segment}`
  const entityLabel = options.segment === 'posts' ? 'a post' : 'an rss feed item'

  beforeAll(async () => {
    user = await createTestUser()
    entityId = await options.createEntityId(user.id)
    const request = createRequest()
    await request.authenticateAs(user)
    const created = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `${options.listNamePrefix} ${createRandomString(8)}` })
    listId = created.body.list.id
    if (options.mode === 'remove') {
      await request
        .post(collectionPath())
        .set('Content-Type', 'application/json')
        .send({ [options.bodyKey]: entityId })
    }
  })

  const postAs = async (currentUser: PrivateUser | undefined, payload: Record<string, string>) => {
    const request = createRequest()
    if (currentUser) await request.authenticateAs(currentUser)
    // Returning the supertest handle from an async function would await it before `.expect`.
    return {
      sent: request.post(collectionPath()).set('Content-Type', 'application/json').send(payload),
    }
  }

  if (options.mode === 'remove') {
    registerRemoveCases(
      entityLabel,
      () => user,
      collectionPath,
      () => entityId,
    )
    return
  }

  registerAddCases(
    options.bodyKey,
    () => user,
    postAs,
    () => entityId,
  )
  return {
    entityId: () => entityId,
    authorizedPost: () => postAs(user, { [options.bodyKey]: entityId }),
  }
}

function registerAddCases(
  bodyKey: ListItemBodyKey,
  owner: () => PrivateUser,
  postAs: (
    currentUser: PrivateUser | undefined,
    payload: Record<string, string>,
  ) => Promise<{ sent: Test }>,
  entityId: () => string,
): void {
  test('returns 401 without auth', async () => {
    const { sent } = await postAs(undefined, { [bodyKey]: entityId() })
    await sent.expect(401)
  })

  test('is idempotent on duplicate add', async () => {
    const { sent } = await postAs(owner(), { [bodyKey]: entityId() })
    await sent.expect(201)
  })

  test('returns 403 for non-owner', async () => {
    const { sent } = await postAs(await createTestUser(), { [bodyKey]: entityId() })
    await sent.expect(403)
  })

  test(`returns 422 when ${bodyKey} is missing`, async () => {
    const { sent } = await postAs(owner(), {})
    await sent.expect(422)
  })

  test(`returns 404 when ${bodyKey} does not exist`, async () => {
    const { sent } = await postAs(owner(), { [bodyKey]: UNKNOWN_ENTITY_ID })
    await sent.expect(404)
  })

  test(`returns 422 when ${bodyKey} is not a valid UUID`, async () => {
    const { sent } = await postAs(owner(), { [bodyKey]: 'not-a-uuid' })
    await sent.expect(422)
  })
}

function registerRemoveCases(
  entityLabel: 'a post' | 'an rss feed item',
  owner: () => PrivateUser,
  collectionPath: () => string,
  entityId: () => string,
): void {
  const deleteAs = async (currentUser: PrivateUser | undefined, path: string) => {
    const request = createRequest()
    if (currentUser) await request.authenticateAs(currentUser)
    return { sent: request.delete(path) }
  }

  test('returns 401 without auth', async () => {
    const { sent } = await deleteAs(undefined, `${collectionPath()}/${entityId()}`)
    await sent.expect(401)
  })

  test('returns 403 for non-owner', async () => {
    const { sent } = await deleteAs(await createTestUser(), `${collectionPath()}/${entityId()}`)
    await sent.expect(403)
  })

  test(`removes ${entityLabel} from the list`, async () => {
    const { sent } = await deleteAs(owner(), `${collectionPath()}/${entityId()}`)
    await sent.expect(204)
  })

  test('returns 422 for invalid UUID entityId', async () => {
    const { sent } = await deleteAs(owner(), `${collectionPath()}/not-a-uuid`)
    await sent.expect(422)
  })
}
