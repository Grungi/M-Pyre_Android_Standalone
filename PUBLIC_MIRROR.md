# Public source snapshot for M-PYRE Android v18

This Git repository is a clean source-only publication of the independently
maintained M-PYRE Android app. It intentionally has **no private development
commit history** and includes **no Android signing keys or credentials**.

Original M-PYRE firmware by History Of Sky, based on SLOOP and Felucca.
GNU GPL-3.0-only software, with separately licensed CC BY 4.0 assets, CC0
fallback drums, MIT/Apache components and SIL OFL fonts. Full inventories:
[LICENSING.md](LICENSING.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md),
[LICENSES/UPSTREAM-LICENSING.md](LICENSES/UPSTREAM-LICENSING.md).

The original upstream v1.0.3 source and soundpack are fetched by
`scripts/prepare_emulator.py` and verified by SHA-256. When sharing
**binaries**, always provide the exact matching complete corresponding
source archive with the binaries. This source-only repository is not a
substitute for the matching source archive of a different APK build.

Build locally with Python 3.12, LLVM/Clang, Android SDK 35 and Gradle 8.9:

```shell
python -m pip install -r requirements.txt
python scripts/prepare_emulator.py
gradle :app:assembleDebug
```

The community derivative is not affiliated with its original rights holders.
The private development repository and its history are not part of this public
source snapshot. The public source repository is
<https://github.com/Grungi/M-Pyre_Android_Standalone>.
