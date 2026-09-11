# Native Client Strategy

Platform ownership table, framework rationale, and decision record for Voucha's native clients.

## Ownership

Swift and .NET client source, native-only tooling, and their CI now live in
[`vouchington/vouchington-clients`](https://github.com/vouchington/vouchington-clients).
Filaments remains the API-fixture producer: client changes consume the staged native contract from
this repository and preserve the parity requirements documented in
[Client Parity Matrix](../../requirements/CLIENT-PARITY-MATRIX.md). Keep implementation-specific
commands and source links in the client repository; this page records the cross-surface product
decisions only.

## Contents

- <a id="spending-category-management"></a>[Spending category management](reference-native-clients-spending-category-management.md)
- <a id="platform-ownership"></a>[Platform Ownership](reference-native-clients-spending-category-management.md#platform-ownership)
- <a id="android--swift-firmly-held"></a>[Android → Swift (firmly held)](reference-native-clients-spending-category-management.md#android--swift-firmly-held)
- <a id="windows--net-maui-lightly-held-reopenable"></a>[Windows → .NET MAUI (lightly held; reopenable)](reference-native-clients-spending-category-management.md#windows--net-maui-lightly-held-reopenable)
- <a id="current-footprint"></a>[Current Footprint](https://github.com/vouchington/vouchington-clients/blob/main/docs/architecture/native-clients.md)
- <a id="app-attest-vs-turnstile-webview-apple-platforms"></a>[App Attest vs. Turnstile WebView (Apple platforms)](https://github.com/vouchington/vouchington-clients/blob/main/docs/architecture/native-clients.md#app-attest-vs-turnstile-webview-apple-platforms)
