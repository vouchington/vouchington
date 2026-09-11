import { cache } from 'react'
import { cookies } from 'next/headers'
import { decodeSessionJwt } from '@ts-shared/session-jwt'
import { ApiError } from '@/lib/api/error'
import { getAuthMe } from '@/lib/api/server'
import type { User } from '@/types/user'

export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  let cookiesList: Awaited<ReturnType<typeof cookies>>
  try {
    cookiesList = await cookies()
  } catch {
    return null
  }

  const dt = cookiesList.get('dt')
  const st = cookiesList.get('st')

  if (!st?.value || !dt?.value) {
    return null
  }

  const payload = decodeSessionJwt(st.value)
  if (!payload?.uid) {
    return null
  }

  try {
    const { user } = await getAuthMe()
    return user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }
    throw error
  }
})
