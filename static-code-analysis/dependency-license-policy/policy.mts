import type { DependencyLicensePolicy } from 'vouchington-tooling/dependency-license-policy'

/** Repository-specific policy; generic collection and SPDX evaluation live in vouchington-tooling. */
export const dependencyLicensePolicy: DependencyLicensePolicy = {
  deniedLicenseIds: ['UNLICENSED', 'Unknown', ''],
  deniedLicensePrefixes: ['GPL', 'AGPL', 'LGPL', 'EPL', 'CDDL', 'SSPL', 'BUSL', 'MPL'],
  knownLicenseAliases: {
    'SIL OPEN FONT LICENSE': 'OFL-1.1',
    // The `sentry` CLI publishes this string; the SPDX id is FSL-1.1-ALv2.
    'FSL-1.1-Apache-2.0': 'FSL-1.1-ALv2',
  },
  allowlist: [
    {
      licenseId: 'MPL-2.0',
      scope: { kind: 'all' },
      reason:
        'File-level weak copyleft: modifications to MPL-2.0 files themselves would need to stay ' +
        'open, but using the package as a dependency creates no obligation on this repository.',
    },
    {
      licenseId: 'LGPL-3.0-or-later',
      scope: {
        kind: 'exact',
        packageNames: [
          '@img/sharp-libvips-darwin-arm64',
          '@img/sharp-libvips-darwin-x64',
          '@img/sharp-libvips-linux-arm',
          '@img/sharp-libvips-linux-arm64',
          '@img/sharp-libvips-linux-ppc64',
          '@img/sharp-libvips-linux-riscv64',
          '@img/sharp-libvips-linux-s390x',
          '@img/sharp-libvips-linux-x64',
          '@img/sharp-libvips-linuxmusl-arm64',
          '@img/sharp-libvips-linuxmusl-x64',
          '@img/sharp-wasm32',
          '@img/sharp-win32-arm64',
          '@img/sharp-win32-ia32',
          '@img/sharp-win32-x64',
        ],
      },
      reason:
        "sharp's audited libvips bundles and Windows/WASM package variants carry LGPL-3.0-or-later " +
        'as a component license. This repository neither modifies nor vendors their source or ' +
        'commits a build artifact. Every other LGPL-3.0-or-later dependency remains reviewable.',
    },
  ],
}
