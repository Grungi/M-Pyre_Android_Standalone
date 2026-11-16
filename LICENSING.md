# M-PYRE Android – licensing and redistribution (v18)

This downstream Android project is based on **M-PYRE v1.0.3**, pinned to
[History Of Sky/m-pyre @ f50926b](https://github.com/HistoryOfSky/m-pyre/tree/f50926b251c49a67df882cc8d33d1044005cf9d8).
It includes changes to the original firmware and editor, an Android Java/WebView
wrapper, browser UI changes, MIDI support and 8-track support.

## Software: GNU GPL version 3 only

The upstream firmware, emulators, editors, build tools and this project's
modifications are licensed **GPL-3.0-only**, unless a particular component
has its own compatible license. Read [LICENSE](LICENSE). Preserve the original
copyright notices, change history, license notices and any applicable additional
permissions; the complete upstream license inventory and **Felucca assets'
GPLv3 section 7 additional permission** are preserved verbatim as
[LICENSES/UPSTREAM-LICENSING.md](LICENSES/UPSTREAM-LICENSING.md).

Copyright and contributors, as identified by the upstream project:
* Leo Kuroshita / Hügelton Instruments – Felucca (2026)
* isod89 and SLOOP contributors – SLOOP (2026)
* 3dSam – Clipper / HYBRID synthesis code (2026)
* History Of Sky – M-PYRE (2026)
* M-PYRE Android downstream contributors – changes in this repository

The upstream project uses Apache-2.0-licensed msfa FM6 synthesis code and
MIT-licensed Fukiai icons; retaining those individual license notices matters
even though the combined GPL-covered application is distributed as GPL-3.0-only.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Audio and artwork: not all GPL

* **Original guitar, palm-mute and bass soundpack:** Copyright (C) 2026
  History Of Sky, **CC BY 4.0**, source
  [M-PYRE v1.0.3 soundpack.bin](https://github.com/HistoryOfSky/m-pyre/releases/tag/v1.0.3),
  license <https://creativecommons.org/licenses/by/4.0/legalcode>.
  The original binary recordings are embedded in the generated WebAssembly
  companion HTML *without changing the recorded samples*. Container conversion
  and Base64 embedding do not make these assets GPL-only.
* **Original M-PYRE logo, splash and other History Of Sky art used at build
  time:** Copyright (C) 2026 History Of Sky, **CC BY 4.0**, source
  <https://github.com/HistoryOfSky/m-pyre>, with the same license link above.
  Images may be rendered/compressed into generated assets, but no authorship or
  trademark endorsement is implied.
* **Fallback drum kit:** rebuilt from upstream
  `assets/samples-cc0/KIT/`, which upstream documents as **CC0 1.0**
  (Versilian Studios VCSL/VSCO-2 CE provenance). The downstream build
  normalizes, trims, resamples and remaps selected files, generates one synthetic
  drop sound, and does **not** include the upstream HEAVY KIT recordings.
  See [LICENSES/SAMPLES-CC0-ATTRIBUTION.txt](LICENSES/SAMPLES-CC0-ATTRIBUTION.txt)
  and <https://creativecommons.org/publicdomain/zero/1.0/>.
* **Original cabinet impulses** from upstream are *not* included: the Android
  emulator uses the documented generic cabinet fallback.
* The upstream promotional video and poster may have separate restrictions;
  neither is packaged with this Android app.

## Redistribution requirements

**Publishing source code:** keep the GPL license and all third-party notices.
**Sharing an APK or standalone offline WebEditor:** make the *complete
corresponding source for that exact build* available through an equally
accessible download, and preserve required license notices and attribution in
the delivered application. The build creates a version-matched source archive
and includes an offline legal-notices page in the APK and WebEditor.
A build's temporary GitHub Actions artifacts expire; they are not a durable
public release location. For a public release, attach the matching source
archive beside the APK/HTML release assets, or ensure an equivalent permanent
public source location. Details in [RELEASING.md](RELEASING.md).

The repository's code license does **not** purport to relicense CC BY, CC0,
Apache-2.0, MIT, SIL OFL or any other third-party assets.
