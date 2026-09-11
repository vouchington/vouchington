# Native Client Strategy reference

[Back to Native Client Strategy](native-clients.md)

## Spending category management

Both native clients provide the authenticated `/my/spending-categories` settings destination.
They consume the cursor-paginated spending-category API, support topic search plus create/edit/delete
for manageable entries, and render member-only household entries as read-only. The shared fixture
contract is registered by Swift core and .NET endpoint-coverage tests; the feature UI is exercised by
the SwiftUI and MAUI surface tests.

## Platform Ownership

| Platform   | Stack                      | UI layer                      | Shared core                                                                                                     |
| ---------- | -------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| macOS      | Swift                      | SwiftUI                       | [Swift core](https://github.com/vouchington/vouchington-clients/tree/main/swift-clients/core)                   |
| iOS / iPad | Swift                      | SwiftUI                       | [Swift core](https://github.com/vouchington/vouchington-clients/tree/main/swift-clients/core)                   |
| Android    | **Swift**                  | Skip Fuse (SwiftUI → Compose) | [Swift core](https://github.com/vouchington/vouchington-clients/tree/main/swift-clients/core)                   |
| Windows    | **.NET MAUI** (on WinUI 3) | MAUI                          | [.NET core](https://github.com/vouchington/vouchington-clients/tree/main/dotnet-clients/src/Voucha.Client.Core) |
| macOS test | **.NET MAUI**              | Mac Catalyst MAUI             | [.NET core](https://github.com/vouchington/vouchington-clients/tree/main/dotnet-clients/src/Voucha.Client.Core) |

## Android → Swift (firmly held)

Swift is the primary Android stack, not .NET MAUI. The rationale is layered and each leg stands
independently:

- **No duplicate core.** The Swift core is a machine-enforced Foundation-only package
  (networking, auth, models, persistence; its guards live with the client repository).
  Using MAUI for Android would require a parallel C# core forever: two implementations of every
  auth cookie flow, model type, and persistence layer. Swift on Android reuses the same package.

- **Swift 6.3 (March 2026) = official first-class Android target.** The Android Workgroup ships
  an official Swift SDK for Android; the Swift project itself hosts the support. This is not a
  third-party bridge.

- **Skip Fuse = native performance.** [Skip](https://skip.tools) / Skip Fuse compiles Swift
  natively to Android ARM (no GC tax, no bridge overhead). Memory and battery profile are
  comparable to hand-written Kotlin. Skip Fuse went fully open-source in January 2026 and its
  technique is being merged back into the Swift project. A showcase app ships to both the App Store
  and Google Play from one Swift codebase.

- **iOS is Android's natural UI sibling.** Both are mobile, touch-first, small-screen. A SwiftUI
  mobile component shared between iOS and Android (via Skip Fuse's SwiftUI → Compose bridge) is
  a tighter fit than reusing desktop MAUI layouts.

- **MAUI-Android is the buggier path in 2026.** .NET 10 introduced regressions on Android 16
  edge-to-edge layout; the community advice as of mid-2026 is to stay on .NET 9 for Android
  production apps. The "MAUI is the safe cross-platform bet" narrative no longer holds for Android
  specifically.

## Windows → .NET MAUI (lightly held; reopenable)

MAUI is the current choice for Windows. This is the one soft call in this document — record it
honestly.

**MAUI on Windows IS WinUI 3.** MAUI's Windows backend is the Windows App SDK / WinUI 3. There is
no fidelity loss relative to a raw WinUI 3 app at the rendering level.

**Why MAUI over raw WinUI 3:**

- **Android-fallback optionality.** If Swift-Android ever stalls, MAUI can add an Android target
  head without a new core stack. This is insurance, not a technical knockout.
- **Already-merged tooling.** PR #6453 already installed the MAUI workload and the inert
  `maui-smoke` CI gate. Switching to raw WinUI 3 would mean reworking that infrastructure.
- **Narrow CI compile-check edge.** Neither MAUI nor WinUI 3 can build the shipped
  `net10.0-windows` artifact on this repo's Linux + macOS fleet (Windows App SDK requires Windows).
  However, a MAUI app with a Mac Catalyst TFM lets the existing macOS runners compile-check the
  shared C# — something a raw WinUI 3 app cannot offer. This is a narrow edge: the Catalyst head is
  an explicit cost (an extra TFM maintained purely for CI) and a real Windows release will require
  Windows CI regardless of framework. The edge shrinks if Catalyst upkeep proves burdensome.

**Reopen trigger:** if Swift-Android solidifies and the Android-fallback insurance is no longer
needed, revisit **WinUI 3 direct** for the Windows app. At that point MAUI's main durable argument
disappears and the cleaner (no unused abstraction layer) choice is raw WinUI 3.
