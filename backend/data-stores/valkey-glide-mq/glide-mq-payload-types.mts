/** Field names that may carry personal data or credentials in a queue payload. */
type SensitivePayloadKey =
  | 'email'
  | 'email_address'
  | 'email-address'
  | 'emailaddress'
  | 'phone'
  | 'phone_number'
  | 'phone-number'
  | 'phonenumber'
  | 'ip'
  | 'ip_address'
  | 'ip-address'
  | 'ipaddress'
  | 'user_agent'
  | 'user-agent'
  | 'useragent'
  | 'token'
  | 'password'
  | 'secret'
  | 'session_id'
  | 'session-id'
  | 'sessionid'
  | 'device_id'
  | 'device-id'
  | 'deviceid'
  | 'oauth_user_id'
  | 'oauth-user-id'
  | 'oauthuserid'
  | 'access_token'
  | 'access-token'
  | 'accesstoken'
  | 'refresh_token'
  | 'refresh-token'
  | 'refreshtoken'
  | 'api_key'
  | 'api-key'
  | 'apikey'
  | 'private_key'
  | 'private-key'
  | 'privatekey'
  | 'authorization'
  | 'credential'
  | 'credentials'

/** Prevents wider object values from smuggling sensitive keys absent from their declared type. */
type NoSensitivePayloadKeys = Partial<Record<SensitivePayloadKey, never>>

type IsSameType<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2
    ? (<T>() => T extends TRight ? 1 : 2) extends <T>() => T extends TLeft ? 1 : 2
      ? true
      : false
    : false

type HasSeenExactType<T, TSeen> = TSeen extends unknown ? IsSameType<T, TSeen> : never

/** True if any union member contains a sensitive key, including in nested union values. */
export type HasSensitiveFields<T, TSeen = never> = T extends unknown
  ? 0 extends 1 & T
    ? true
    : unknown extends T
      ? true
      : true extends HasSeenExactType<T, TSeen>
        ? false
        : T extends readonly (infer TElement)[]
          ? HasSensitiveFields<TElement, TSeen | T>
          : T extends string | number | boolean | bigint | symbol | null | undefined
            ? false
            : T extends object
              ? string extends keyof T
                ? [T[string & keyof T]] extends [never]
                  ? false
                  : true
                : [keyof T] extends [never]
                  ? true
                  : true extends {
                        [TKey in keyof T]: Lowercase<TKey & string> extends SensitivePayloadKey
                          ? true
                          : HasSensitiveFields<T[TKey], TSeen | T>
                      }[keyof T]
                    ? true
                    : false
              : false
  : never

/** Replaces sensitive fields with `never`, so a producer cannot pass values for them. */
export type NoSensitiveFields<T> = T extends readonly unknown[]
  ? { [TKey in keyof T]: NoSensitiveFields<T[TKey]> }
  : T extends string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends object
      ? string extends keyof T
        ? [T[string & keyof T]] extends [never]
          ? T
          : never
        : [keyof T] extends [never]
          ? never
          : {
              [TKey in keyof T]: Lowercase<TKey & string> extends SensitivePayloadKey
                ? never
                : NoSensitiveFields<T[TKey]>
            } & NoSensitivePayloadKeys
      : unknown extends T
        ? never
        : T
