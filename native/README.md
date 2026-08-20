# Wave 20D Media Foundation helper

`media-foundation-player.cpp` is the bounded Windows native playback path for
the single-video editor. It owns an `IMFMediaSession`, builds an EVR output
topology with `MFCreateVideoRendererActivate`, and accepts a narrow JSON-lines
command stream on stdin. The main process must resolve a project-local media
asset before launching it; the renderer never supplies a source path.

The helper uses the following native operations:

- Scrub: `IMFRateControl::SetRate(FALSE, 0.0f)` followed by
  `IMFMediaSession::Start` with a 100 ns position. A scrub is complete only
  after `MESessionScrubSampleComplete`; `scrub-submitted` is not completion.
  Media Session seeks are FIFO, so a newer scrub stops the current one and
  coalesces queued pointer positions to the latest request before starting it.
- Frame-step capability: EVR `IVideoFrameStep::CanStep`, `Step(1, ...)`, and
  `CancelStep()` are wired for native capability detection. The editor's
  exact previous/next operation currently uses the Media Session scrub path in
  both directions, because `Step` completion is asynchronous and its
  `EC_STEP_COMPLETE` notification belongs to a DirectShow graph manager. The
  editor never reports the `Step` submission as a displayed frame.
- Playback: the Media Foundation session clock and `IMFRateControl` (default
  rate `1.0`).

There is no HTML video element, `currentTime`, PNG/frame cache, base64 frame,
or per-frame file IPC in this path.

## Build (Windows Developer PowerShell)

Run from the repository root after installing the Windows 10/11 SDK and a
Windows C++ toolchain:

```powershell
.\native\build-media-foundation-player.ps1
```

The script writes the untracked executable to `native/bin/`. It prefers
`cl.exe` from a Visual Studio Developer PowerShell and falls back to a
MinGW-w64 `g++` installation when available (including the common
`C:\msys64\ucrt64\bin\g++.exe` location). The fallback links the C++ runtime
statically. The required Media Foundation and EVR import libraries are part
of the Windows SDK (`mf.lib`, `mfplat.lib`, `mfuuid.lib`, `evr.lib`,
`shlwapi.lib`, `ole32.lib`, and `propsys.lib`).

Equivalent command:

```powershell
cl /nologo /std:c++17 /EHsc /W4 /DUNICODE /D_UNICODE `
  native\media-foundation-player.cpp `
  /link /OUT:native\bin\media-foundation-player.exe `
  mf.lib mfplat.lib mfuuid.lib evr.lib shlwapi.lib ole32.lib propsys.lib
```

## Helper protocol

The executable is launched by Electron as:

```text
media-foundation-player.exe --source <trusted-absolute-project-path> --hwnd <hex-window-handle>
```

Commands are JSON objects, one per line. `requestId` is echoed on command
events and is generated/validated by the preload bridge:

```json
{"command":"scrub","requestId":"r1","position100ns":2500000}
{"command":"set-bounds","requestId":"r0","x":20,"y":40,"width":640,"height":360,"devicePixelRatio":1}
{"command":"frame-step","requestId":"r2","forward":true}
{"command":"cancel-frame-step","requestId":"r3"}
{"command":"play","requestId":"r4","rate100":100}
{"command":"pause","requestId":"r5"}
{"command":"stop","requestId":"r6"}
{"command":"close","requestId":"r7"}
```

Events are JSON objects on stdout. `ready` means the topology is ready,
`scrub-submitted` acknowledges the request, and `scrub-complete` carries the
actual `MESessionScrubSampleComplete` completion. Missing codecs, a missing
helper binary, an unsupported EVR frame-step capability, and invalid source
paths are explicit errors; they are never converted into a ready/succeeded
state.

The helper creates a child render window under the supplied parent HWND. The
Electron bridge sends `set-bounds` for each layout update; coordinates are
CSS-pixel bounds plus the validated device-pixel ratio, and the helper applies
the scaled child rectangle without taking keyboard focus.

## Current verification boundary

The helper can be built in this checkout with the MinGW-w64 fallback. A local
Win32 parent-window smoke opened a project MP4, applied bounds, completed a
real `MESessionScrubSampleComplete`, exercised play/pause and observed the
end-of-media event. Electron HWND integration and renderer-level human
acceptance are still required before calling the product runtime-verified.
The JavaScript bridge returns `NATIVE_PLAYER_UNAVAILABLE` until
`native/bin/media-foundation-player.exe` exists.
