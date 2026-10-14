import { beginTransaction } from '@data-stores/psql'
import {
  resolveCopyrightImagePlacements,
  resolveCopyrightPostImagePlacements,
  type CopyrightImageSelector,
} from '../services/copyright-notices/placement-resolution.mts'

export async function resolveTestCopyrightImagePlacements(selectors: CopyrightImageSelector[]) {
  await using transaction = await beginTransaction()
  return await resolveCopyrightImagePlacements(selectors, transaction)
}

export async function resolveTestCopyrightPostImagePlacements(
  selectors: Array<Extract<CopyrightImageSelector, { surfaceKind: 'post-image' }>>,
) {
  await using transaction = await beginTransaction()
  return await resolveCopyrightPostImagePlacements(selectors, transaction)
}
