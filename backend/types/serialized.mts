/**
 * Recursively converts Date fields to string for JSON-serialized API responses.
 * Reflects what JSON.stringify does to Date objects at the type level.
 *
 * Usage in web (where API responses use ISO strings, not Date objects):
 *
 *   import type { Serialized } from '@voucha/types/serialized'
 *   import type { Post } from '@voucha/types/entities/post'
 *
 *   type WebPost = Serialized<Post>  // all Date fields become string
 */
export type Serialized<T> = T extends Date
  ? string
  : T extends ReadonlyArray<infer U>
    ? Serialized<U>[]
    : T extends Record<string, unknown>
      ? { [K in keyof T]: Serialized<T[K]> }
      : T
