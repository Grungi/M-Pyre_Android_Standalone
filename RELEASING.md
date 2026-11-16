# Publication checklist – M-PYRE Android

This source repository is public. Keep the separate development repository
private; publishing this mirror does not publish any private commit history.
Follow this checklist for all releases of APKs and standalone WebEditors.

1. Select the exact commit to release. The Android wrapper, patched
   M-PYRE v1.0.3 firmware and official editor must all correspond to
   that commit. Do not substitute a different or older source revision.
2. Run `.github/workflows/build-apk.yml` (or push the release branch).
   The workflow generates the firmware and PC editor, checks the legal
   notices, compiles the APK and packages three artifacts:
   - APK: `M-PYRE-Android-v1.0.3-8Tracks-v18-HomeDrumTouch-debug-APK`
   - PC editor: `M-PYRE-PC-WebEditor-8Tracks-v18`
   - complete source: `M-PYRE-v18-corresponding-source`
3. Confirm CI is green. Inspect both the APK and HTML's license notices;
   verify the source archive has `android-app/` and the pinned
   `upstream-m-pyre-v1.0.3/` source plus the corresponding soundpack and build
   scripts. Include the GPL license, author credits, CC BY attribution,
   MIT/Apache notices and the Felucca additional permission.
4. For **every binary distribution**, make the corresponding source from
   the *same build* equally available (at no additional charge). Upload the
   APK, WebEditor and source archive together to a versioned GitHub Release,
   or provide an equivalent permanent accessible source download. Do not
   rely only on expiring Actions artifacts.
5. Tag the exact commit used in that build (example `v18-android`), and
   provide checksum information from the source archive's `SOURCE-INFO.txt`.
6. When releasing from a private repository, recipients of an APK must
   receive source-access instructions that **actually work** for them.
   Merely linking to a private GitHub source checkout is not sufficient.
7. Prefer a reproducible/stable signing workflow for a public Android
   release; debug-key APKs may not update in place. Never commit signing keys.
8. Verify all material in the release, including any externally supplied
   imagery/audio not part of this repository, is covered by the documented
   licenses and attribution. Do not bundle the upstream promotional video
   or proprietary JieLi hardware SDK files.

**What the generated source archive contains:** the version-matched Android
repository's tracked source; the exact patched upstream M-PYRE checkout
(`firmware/`, `tools/`, original third-party and asset sources); the original
CC BY soundpack and processed CC0 drum mapping used for the build; generated
offline app/editor HTML and the legal notices. A `SOURCE-INFO.txt` records
the app commit and SHA-256 checksums for the APK, WebEditor and soundpack.

The archive excludes caches and intermediate build products that can be
regenerated from the included source, and does not include platform SDKs or
unmodified system development tools.

### Source and license references

* GNU GPLv3: <https://www.gnu.org/licenses/gpl-3.0.html>
* CC BY 4.0: <https://creativecommons.org/licenses/by/4.0/legalcode>
* Upstream M-PYRE v1.0.3: <https://github.com/HistoryOfSky/m-pyre/releases/tag/v1.0.3>
* Original license inventory: [LICENSES/UPSTREAM-LICENSING.md](LICENSES/UPSTREAM-LICENSING.md)

These files automate many licensing requirements but do **not** constitute
legal clearance for third-party assets added outside the documented build.
