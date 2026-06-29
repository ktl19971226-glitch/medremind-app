# Xiaoyue iOS GitHub Actions Secrets

This app uses GitHub Actions on `macos-26` to archive, export, and upload the iOS IPA for App Store Connect.

## Required App Values

- App name: `小約`
- Apple ID: `6785490121`
- Bundle ID: `com.yaojidecare.xiaoyue`
- Team ID: `7Q3USC33A5`
- SKU: `xiaoyue-ios-2026`
- Workflow: `.github/workflows/build-ios-ipa.yml`

## GitHub Secrets

Add these in GitHub repo settings:

- `IOS_DISTRIBUTION_P12_BASE64`: Base64 of the Apple Distribution `.p12` certificate.
- `IOS_DISTRIBUTION_P12_PASSWORD`: Password used when exporting the `.p12`.
- `IOS_KEYCHAIN_PASSWORD`: Temporary CI keychain password. Any strong random string is fine.
- `APPSTORE_KEY_ID`: App Store Connect API key ID.
- `APPSTORE_ISSUER_ID`: App Store Connect issuer ID.
- `APPSTORE_PRIVATE_KEY_BASE64`: Base64 of the App Store Connect `AuthKey_XXXXXXXXXX.p8`.

Use one provisioning profile method:

- `XIAOYUE_IOS_APPSTORE_PROFILE_BASE64`: Base64 of the App Store provisioning profile for `com.yaojidecare.xiaoyue`.
- Or `XIAOYUE_APPSTORE_PROFILE_ID`: App Store Connect API profile ID for the same bundle ID. This requires the three `APPSTORE_*` API secrets above.

The workflow also supports the unprefixed `IOS_APPSTORE_PROFILE_BASE64` / `APPSTORE_PROFILE_ID` names as fallbacks for a standalone Xiaoyue repository. In the shared MedRemind repository, use the Xiaoyue-prefixed names so MedRemind's existing profile secret is not overwritten.

## Base64 Commands

On macOS:

```bash
base64 -i distribution.p12 | pbcopy
base64 -i xiaoyue-appstore-2026.mobileprovision | pbcopy
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
```

On Linux:

```bash
base64 -w 0 distribution.p12
base64 -w 0 xiaoyue-appstore-2026.mobileprovision
base64 -w 0 AuthKey_XXXXXXXXXX.p8
```

## Apple Signing Checklist

1. Apple Developer Certificates: create or reuse an Apple Distribution certificate for team `7Q3USC33A5`.
2. Export it as `.p12` from Keychain Access with a password.
3. Apple Developer Profiles: create an App Store profile for bundle ID `com.yaojidecare.xiaoyue`.
4. Download the `.mobileprovision`, or copy its App Store Connect profile ID into `APPSTORE_PROFILE_ID`.
5. App Store Connect Users and Access: create an API key with access that can upload builds.
6. Add all secrets to GitHub.
7. Run the workflow manually, or commit a change to `trigger-build.txt`.

## Notes

- Do not commit `.p12`, `.mobileprovision`, `.p8`, or decoded secret files.
- The workflow validates the provisioning profile bundle ID before building.
- The final Linux workspace still cannot create an Apple archive locally; the archive must be built on GitHub's macOS runner.
