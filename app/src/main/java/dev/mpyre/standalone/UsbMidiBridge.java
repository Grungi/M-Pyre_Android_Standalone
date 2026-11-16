// SPDX-License-Identifier: GPL-3.0-only
package dev.mpyre.standalone;

import android.app.Activity;
import android.content.Context;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import android.media.midi.MidiDevice;
import android.media.midi.MidiDeviceInfo;
import android.media.midi.MidiInputPort;
import android.media.midi.MidiManager;
import android.media.midi.MidiOutputPort;
import android.media.midi.MidiReceiver;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.io.IOException;
import java.util.Locale;

/**
 * Android MIDI 1.0 byte stream <-> running M-PYRE firmware bridge.
 * PC mode connects Android's USB MIDI gadget to a computer editor.
 * Host mode connects a class-compliant USB MIDI instrument (e.g. USB-B)
 * to the phone through a USB-C host cable. The cable has no driver.
 * Android's MidiManager handles MIDI, not raw USB transfers.
 * The app does not impersonate an FM-1 at USB descriptor level.
 *
 * Data is streamed as MIDI bytes, not USB packets. The JS bridge reassembles
 * fragmented SysEx frames up to the FM-1 editor's 640-byte request limit.
 * Device connection and open/close operations live on Android's main looper.
 */
final class UsbMidiBridge {
    interface Listener {
        void onBytes(byte[] message);
        void onState(boolean connected, String detail);
    }
    private static final String TAG = "MPyreUsbMidi";
    private final Activity activity;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private MidiManager manager;
    private MidiManager.DeviceCallback callback;
    private MidiDevice device;
    private MidiInputPort input;           // Sends bytes TO PC via Android gadget
    private MidiOutputPort output;         // Receives bytes FROM PC
    private MidiReceiver receiver;
    private int currentId = -1, generation = 0;
    private boolean opening = false, stopped = false;
    private boolean hostMode = false;

    UsbMidiBridge(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
    }

    /** UI-thread mode switch; close the previous USB MIDI session on change. */
    void setHostMode(boolean enabled) {
        if (hostMode == enabled) return;
        hostMode = enabled;
        if (!stopped && manager != null) reconnect(true);
    }

    void start() {
        if (callback != null || stopped) { reconnect(); return; }
        manager = (MidiManager) activity.getSystemService(Context.MIDI_SERVICE);
        if (manager == null) {
            listener.onState(false, "Android bietet keinen MIDI-Dienst.");
            return;
        }
        callback = new MidiManager.DeviceCallback() {
            @Override public void onDeviceAdded(MidiDeviceInfo info) { reconnect(); }
            @Override public void onDeviceRemoved(MidiDeviceInfo info) {
                if (info.getId() == currentId) disconnect();
                reconnect();
            }
        };
        manager.registerDeviceCallback(callback, main);
        reconnect();
    }

    // Automatic callbacks must not disrupt an already opened session.
    void reconnect() { reconnect(false); }

    // Explicit user action performs a REAL close/re-enumerate/reopen even if
    // Android returns the same USB-MIDI peripheral ID.
    void rescan() {
        if (stopped || manager == null) {
            listener.onState(false, "USB-MIDI-Dienst nicht verfügbar.");
            return;
        }
        listener.onState(device != null, hostMode ?
            "USB-MIDI-Host wird erneut gesucht …" : "USB-MIDI wird erneut gesucht …");
        reconnect(true);
    }

    private void reconnect(boolean force) {
        if (stopped || manager == null) return;
        MidiDeviceInfo candidate = null;
        int score = -1;
        try {
            for (MidiDeviceInfo info : manager.getDevices()) {
                if (info.getType() != MidiDeviceInfo.TYPE_USB) continue;
                // Android exposes an actual UsbDevice for an attached host
                // peripheral, but not for its own PC-facing MIDI gadget.
                boolean external = info.getProperties().get(
                    MidiDeviceInfo.PROPERTY_USB_DEVICE) instanceof UsbDevice;
                if (external != hostMode) continue;
                if (hostMode ? (info.getInputPortCount() < 1 &&
                                 info.getOutputPortCount() < 1) :
                               (info.getInputPortCount() < 1 ||
                                info.getOutputPortCount() < 1)) continue;
                String name = String.valueOf(info.getProperties()
                        .getString(MidiDeviceInfo.PROPERTY_NAME)).toLowerCase(Locale.ROOT);
                int rank = hostMode ?
                    (name.contains("m-pyre") ? 4 : name.contains("fm-1") ? 3 :
                     name.contains("midi") ? 2 : 1) :
                    (name.contains("peripheral") ? 3 :
                     name.contains("android") ? 2 : 1);
                if (rank > score) { candidate = info; score = rank; }
            }
        } catch (RuntimeException error) {
            listener.onState(false, "MIDI-Geräteabfrage fehlgeschlagen.");
            Log.w(TAG,"MIDI enumeration failed",error);
            return;
        }
        if (candidate == null) {
            disconnect();
            if (hostMode) {
                UsbManager usb = (UsbManager) activity.getSystemService(Context.USB_SERVICE);
                int attached = usb == null ? 0 : usb.getDeviceList().size();
                listener.onState(false, attached > 0 ?
                    "USB-Gerät erkannt, aber kein USB-MIDI-1.0-Port. Ist es ein MIDI-Gerät?" :
                    "Kein USB-MIDI-Gerät erkannt. USB-C → USB-B am Instrument anschließen.");
            } else {
                listener.onState(false,
                    "Suche abgeschlossen: kein USB-MIDI-Port. USB → MIDI am Handy wählen.");
            }
            return;
        }
        if (!force && device != null && candidate.getId() == currentId) return;
        if (opening && !force) return;
        disconnect();
        opening = true;
        final MidiDeviceInfo selected = candidate;
        final boolean openingHost = hostMode;
        final int epoch = ++generation;
        final String displayName = String.valueOf(
            selected.getProperties().getString(MidiDeviceInfo.PROPERTY_NAME));
        listener.onState(false,(openingHost ? "USB-MIDI-Host" : "USB-MIDI-PC") +
            " gefunden: " + displayName + " (verbinde …)");
        manager.openDevice(selected, opened -> {
            if (stopped || epoch != generation) {
                closeDevice(opened);
                return;
            }
            opening = false;
            if (opened == null) {
                listener.onState(false,"USB-MIDI konnte nicht geöffnet werden.");
                return;
            }
            MidiInputPort send = null;
            MidiOutputPort receive = null;
            try {
                // Some MIDI controllers only transmit notes to Android.
                // The legacy PC gadget still requires both directions.
                if (selected.getInputPortCount() > 0) send = opened.openInputPort(0);
                if (selected.getOutputPortCount() > 0) receive = opened.openOutputPort(0);
                if ((!openingHost && (send == null || receive == null)) ||
                    (send == null && receive == null))
                    throw new IOException("Kein verwendbarer USB-MIDI-Port");
                MidiReceiver handler = new MidiReceiver() {
                    @Override public void onSend(byte[] data, int offset, int count, long timestamp) {
                        if (count <= 0 || count > 4096) return;
                        byte[] copy = new byte[count];
                        System.arraycopy(data, offset, copy, 0, count);
                        listener.onBytes(copy);
                    }
                };
                if (receive != null) receive.connect(handler);
                device = opened;
                input = send;
                output = receive;
                receiver = handler;
                currentId = selected.getId();
                listener.onState(true,(openingHost ? "USB-MIDI-Host verbunden: " :
                    "USB-MIDI verbunden: ") + displayName +
                    (send == null ? " (nur MIDI empfangen)" :
                     receive == null ? " (nur MIDI senden)" :
                     " (MIDI-Eingang/Ausgang bereit)"));
                Log.i(TAG,"USB-MIDI connected: "+displayName);
            } catch(Exception error) {
                if (send != null) try { send.close(); } catch(IOException ignored) {}
                if (receive != null) try { receive.close(); } catch(IOException ignored) {}
                closeDevice(opened);
                listener.onState(false,"USB-MIDI-Portfehler: "+error.getMessage());
                Log.e(TAG,"USB MIDI open failed",error);
            }
        }, main);
    }

    // Called by @JavascriptInterface on the bridge's own (non-UI) thread.
    synchronized boolean sendToPc(byte[] bytes) {
        if (bytes == null || bytes.length < 1 || bytes.length > 640) return false;
        if (input == null || stopped) return false;
        try {
            input.send(bytes, 0, bytes.length);
            return true;
        } catch (IOException | RuntimeException error) {
            Log.w(TAG,"MIDI send failed",error);
            return false;
        }
    }

    void disconnect() {
        generation++;
        opening = false;
        if (output != null) {
            if (receiver != null) output.disconnect(receiver);
            try { output.close(); } catch(IOException ignored) {}
            output = null;
        }
        synchronized (this) {
            if (input != null) try { input.close(); } catch(IOException ignored) {}
            input = null;
        }
        closeDevice(device);
        device = null;
        receiver = null;
        currentId = -1;
        listener.onState(false, hostMode ?
            "USB-MIDI-Host getrennt. USB-B-MIDI-Gerät anschließen." :
            "USB-MIDI getrennt. USB → MIDI aktivieren.");
    }

    void stop() {
        stopped = true;
        if (manager != null && callback != null) {
            manager.unregisterDeviceCallback(callback);
            callback = null;
        }
        disconnect();
    }

    private void closeDevice(MidiDevice d) {
        if (d == null) return;
        try { d.close(); } catch(IOException ignored) {}
    }
}
