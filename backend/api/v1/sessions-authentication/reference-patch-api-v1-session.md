# PATCH /api/v1/session

[Back to Sessions & Authentication API](README.md#patch-apiv1session)

Called by Next.js to validate and refresh JWT tokens on each page load. Extends token expiration if
the `dt`/`st` pair is still valid, or rotates to a fresh anonymous session otherwise.
Unlike the web proxy's hot-path passthrough, this route always verifies revocation for an
authenticated `dt`/`st` pair before returning session state, even when the token's embedded
`sca` freshness window has not elapsed.

**Request:**

```json
{ "dt": "<device_token>", "st": "<session_token>" }
```

`st` without a valid matching `dt` is treated as invalid session state and does **not** preserve
the existing session.

**Response:**

```json
{
  "session": {
    "dte": 2592000,
    "ste": 172800,
    "secure": true,
    "did": "<device_id>",
    "dt": "<device_token>",
    "st": "<session_token>",
    "sid": "<session_id>",
    "uid": "<user_id_or_null>",
    "session": {
      "did": "<device_id>",
      "sid": "<session_id>",
      "uid": "<user_id_or_null>"
    }
  }
}
```

In test environments, also sets `dt` and `st` cookies.

Use the outer `session.did`, `session.sid`, and `session.uid` fields as the canonical values.
The nested `session.session` object mirrors the JWT payload returned by the current route shape.
