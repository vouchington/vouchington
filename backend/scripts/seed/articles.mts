import { getSystemUserByUsername } from '@services/users/system-users'
import { getPrivateUserByAny } from '@services/users/get'
import { syncLocalArticles } from '@services/articles'

export async function seedArticles() {
  const systemUser = await getSystemUserByUsername('system')
  if (!systemUser) {
    throw new Error('No system user found — seed users first')
  }
  const user = await getPrivateUserByAny(systemUser.id)
  if (!user) {
    throw new Error('Could not get private system user')
  }

  await syncLocalArticles(user)
}
