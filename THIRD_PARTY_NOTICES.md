# Third-party licenses, provenance and modifications

This is the license-and-attribution inventory for M-PYRE Android v18.
The upstream project's complete inventory and additional permission terms are
preserved in [LICENSES/UPSTREAM-LICENSING.md](LICENSES/UPSTREAM-LICENSING.md).
This document does not replace copyright notices in original source files.

| Component | Rightsholder(s) | License | Distribution / changes |
| --- | --- | --- | --- |
| M-PYRE firmware, original emulator and editors | History Of Sky; predecessors SLOOP (isod89/contributors), Felucca (Leo Kuroshita/Hügelton Instruments) | GPL-3.0-only | Source fetched from pinned v1.0.3, patched for Android 7+1 tracks, live editing, song transport, MIDI and LCD touch |
| Clipper HYBRID voice and patches | 3dSam | GPL-3.0 | In upstream firmware; retain original headers |
| CrispyZebra-based PHASE waveforms | Leo Kuroshita | GPL-3.0 | In upstream firmware; retain original headers |
| msfa / Dexed-derived FM6 core | Google Inc., Pascal Gauthier; C adaptation by Leo Kuroshita | Apache-2.0 | Original upstream license & modifications: [LICENSES/Apache-2.0-msfa.txt](LICENSES/Apache-2.0-msfa.txt) |
| Original M-PYRE guitar/bass/palm-mute audio | History Of Sky | CC BY 4.0 | Original v1.0.3 soundpack embedded as shipped; attribution and license <https://creativecommons.org/licenses/by/4.0/legalcode> |
| Original M-PYRE splash/logo art | History Of Sky | CC BY 4.0 | Generated/embedded into emulator; source <https://github.com/HistoryOfSky/m-pyre> |
| Android fallback drum WAVs | VCSL / VSCO-2 CE by Versilian Studios, upstream collection | CC0 1.0 | Trimmed, resampled, leveled and remapped; original-to-derived provenance [LICENSES/SAMPLES-CC0-ATTRIBUTION.txt](LICENSES/SAMPLES-CC0-ATTRIBUTION.txt) |
| Fukiai icon font (`fukiai.ttf`) | Hügelton Instruments | **MIT** | Original [LICENSES/MIT-Fukiai.txt](LICENSES/MIT-Fukiai.txt); **not SIL OFL** |
| Barlow Condensed (screen/installer fonts) | Jeremy Tribby | SIL OFL 1.1 | Upstream `assets/fonts/BarlowCondensed-OFL.txt` |
| Black Ops One, Damion, Pacifico, Racing Sans One, Russo One (amp images) | Respective font creators | SIL OFL 1.1 | Upstream `assets/mpyre/fonts/OFL-*.txt` |
| Terminus editor glyphs | Terminus contributors | SIL OFL 1.1 | Upstream `assets/fonts/Terminus-LICENSE.txt` |
| AndroidX WebKit (WebViewAssetLoader) | Android Open Source Project contributors | Apache-2.0 | Android application dependency `androidx.webkit:webkit:1.13.0`. License <https://www.apache.org/licenses/LICENSE-2.0> |
| Python build-time dependencies: Pillow, NumPy, SciPy | Their respective contributors | Upstream open-source licenses | Build-time only, not embedded into the APK; see their packages' notices |
| Felucca icon atlas and other original Felucca assets, where included | Hügelton Instruments | Upstream GPLv3 **section 7 additional permission** | Permission text and asset restrictions are preserved in upstream `LICENSING.md` |

M-PYRE Android is a **community derivative**; it is not endorsed by
History Of Sky, Hügelton Instruments, M-VAVE, or their respective owners.
The original device's proprietary JieLi SDK is **not shipped** by this
Android emulator; the upstream licensing inventory describes its separate
hardware build process.

The build copies upstream attribution and the applicable font license files
to `app/src/main/assets/legal/` and embeds the combined notices in the
standalone PC WebEditor HTML. The legal-notices page is reachable from
**Options -> Open-source licenses** in the Android app.

Always distribute a source archive made from the **same CI run** as the APK
and WebEditor. Never use a later source revision as a substitute for an
older binary's corresponding source.
