# Authorization

[Back to Topics API](README.md#authorization)

- GET: public
- POST/PATCH topic, alias, or merge: admin only
- DELETE topic: unsupported; returns 405 with `Allow: GET, PATCH`
- Sub-resource PATCH: authenticated users
