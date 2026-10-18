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
  | 'oauthuserid'
  | 'access_token'
  | 'accesstoken'
  | 'refresh_token'
  | 'refreshtoken'
  | 'api_key'
  | 'apikey'
  | 'private_key'
  | 'privatekey'
  | 'authorization'
  | 'credential'
  | 'credentials'

/** Replaces sensitive fields with `never`, so a producer cannot pass values for them. */
export type NoSensitiveFields<T> = T extends readonly unknown[]
  ? { [TKey in keyof T]: NoSensitiveFields<T[TKey]> }
  : T extends object
    ? string extends keyof T
      ? [T[string & keyof T]] extends [never]
        ? T
        : never
      : {
          [TKey in keyof T]: Lowercase<TKey & string> extends SensitivePayloadKey
            ? never
            : NoSensitiveFields<T[TKey]>
        }
    : unknown extends T
      ? never
      : T
