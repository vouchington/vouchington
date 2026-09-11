# JWT Session Service

Mostly stateless JWT-based session management. Device and session JWTs are self-contained and
cryptographically signed; authenticated request context also checks session revocation before
treating a uid-bearing session as logged in.

## Contents

- <a id="architecture"></a>[Architecture](reference-architecture.md)
- <a id="jwt-key-configuration"></a>[JWT Key Configuration](reference-jwt-key-configuration.md)
- <a id="valkey-keys"></a>[Valkey Keys](reference-valkey-keys.md)
- <a id="api"></a>[API](reference-api.md)
- <a id="notes"></a>[Notes](reference-notes.md)
- <a id="related"></a>[Related](reference-related.md)
