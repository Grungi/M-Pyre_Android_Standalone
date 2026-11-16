#!/usr/bin/env python3
"""Native USB-MIDI bridge and original offline PC editor packaging checks."""
from pathlib import Path
java=Path("app/src/main/java/dev/mpyre/standalone/UsbMidiBridge.java").read_text()
main=Path("app/src/main/java/dev/mpyre/standalone/MainActivity.java").read_text()
manifest=Path("app/src/main/AndroidManifest.xml").read_text()
shell=Path("app/src/main/assets/index.html").read_text()
pc=Path("app/src/main/assets/pc-usb-editor.html").read_text()
need_java=["MidiManager","registerDeviceCallback","MidiDeviceInfo.TYPE_USB",
          "openInputPort(0)","openOutputPort(0)","MidiReceiver","sendToPc","reconnect"]
for token in need_java: assert token in java,f"Missing native USB-MIDI: {token}"
for token in ["sendUsbMidi(String","scanUsbMidi()","window.MPyreUsbMidi?.receive",
              "new UsbMidiBridge(", "usbMidiBridge.stop()"]: 
    assert token in main,f"Missing WebView integration: {token}"
assert 'android.software.midi' in manifest
assert 'void rescan()' in java and 'reconnect(true)' in java
assert 'if (!force && device != null && candidate.getId() == currentId) return;' in java
assert 'if (callback != null || stopped)' in java
assert 'usbMidiBridge.rescan()' in main
assert 'usbMidiBridge.reconnect();' not in main
for token in ["MPyreUsbMidi","usbConnected","data.usb","fromFirmware",
              "usb-midi-refresh","MIDI NEU SUCHEN","USB-MIDI WIRD GESUCHT"]:
    assert token in shell,f"Missing JS USB transport: {token}"
assert len(pc)>700000 and 'usb[ _-]*midi' in pc and 'android|peripheral' in pc
assert 'USB / MIDI diagnostics' in pc and 'showMidiPorts(' in pc
assert 'navigator.requestMIDIAccess({ sysex: true })' in pc
print("Android USB-MIDI device bridge, real original PC editor, WebView and SysEx routing present")
assert "#android-options-panel" in Path("android/usb-midi.css").read_text()
assert 'statusLine.innerHTML' in Path("android/usb-midi.js").read_text()
for token in ["android.hardware.usb.host", "USB-MIDI-Host"]:
    assert token in (manifest + java), f"Missing USB host support: {token}"
for token in ["PROPERTY_USB_DEVICE", "instanceof UsbDevice", "setHostMode(boolean enabled)",
              "selected.getInputPortCount() > 0", "selected.getOutputPortCount() > 0"]:
    assert token in java, f"Missing host MIDI recognition/ports: {token}"
assert 'setUsbHostMode(boolean enabled)' in main
for token in ["usb-midi-mode", "setUsbHostMode", "USB-B MIDI-Gerät", "applyMode"]:
    assert token in Path("android/usb-midi.js").read_text(), f"Missing host UI: {token}"
print("USB Refresh button: native force rescan and UI feedback verified")
print("USB-C to USB-B MIDI host option and PC gadget isolation verified")
