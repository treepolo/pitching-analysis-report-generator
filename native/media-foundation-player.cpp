// Wave 20D bounded native playback helper.
//
// This process owns the Media Foundation session and the EVR sink.  It is
// deliberately a small stdin/stdout command host so Electron never receives
// a filesystem path or a COM object through the renderer bridge.  The main
// process resolves a project-local source and supplies the native window
// handle; the helper only receives that trusted, already-resolved input.
//
// The scrubbing contract is intentionally explicit:
//   1. IMFRateControl::SetRate(FALSE, 0.0f) puts the session in scrub mode.
//   2. IMFMediaSession::Start(position) requests the new sample.
//   3. MESessionScrubSampleComplete is the only successful scrub completion
//      event.  A command acknowledgement is never reported as a new frame.
//
// Frame stepping uses EVR's IVideoFrameStep::Step/CancelStep interface.  No
// PNG, frame cache, HTML video element, or renderer-side wall-clock seeking is involved.

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

#include <evr.h>
#include <mfapi.h>
#include <mferror.h>
#include <mfidl.h>
#include <propvarutil.h>
#include <strmif.h>
#include <wrl/client.h>

#include <atomic>
#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cmath>
#include <cstdlib>
#include <cwchar>
#include <functional>
#include <iostream>
#include <limits>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>

#pragma comment(lib, "mf.lib")
#pragma comment(lib, "mfplat.lib")
#pragma comment(lib, "mfuuid.lib")
#pragma comment(lib, "evr.lib")
#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "propsys.lib")

using Microsoft::WRL::ComPtr;

namespace {

constexpr LONGLONG kHundredNanosecondsPerSecond = 10'000'000;
constexpr DWORD kOpenTimeoutMs = 15'000;
constexpr wchar_t kSurfaceClassName[] = L"PitchingReportMediaSurface";

// Some MinGW import libraries do not export this SDK GUID even though the
// Windows SDK headers declare it. Keep the canonical value local so the
// helper remains linkable with both the supported MSVC toolchain and a MinGW
// syntax/link smoke; the interface is still the EVR MR_VIDEO_RENDER_SERVICE.
constexpr GUID kMrVideoRenderService = {
    0x1092a86c, 0xab1a, 0x459a,
    {0xa3, 0x36, 0x83, 0x1f, 0xbc, 0x4d, 0x11, 0xff}};

std::string HResultCode(HRESULT value) {
  std::ostringstream stream;
  stream << "0x" << std::hex << std::uppercase
         << static_cast<unsigned long>(value);
  return stream.str();
}

std::string JsonEscape(const std::string& value) {
  std::string escaped;
  escaped.reserve(value.size() + 8);
  for (const char character : value) {
    switch (character) {
      case '\\': escaped += "\\\\"; break;
      case '"': escaped += "\\\""; break;
      case '\n': escaped += "\\n"; break;
      case '\r': escaped += "\\r"; break;
      case '\t': escaped += "\\t"; break;
      default:
        if (static_cast<unsigned char>(character) < 0x20) {
          escaped += '?';
        } else {
          escaped += character;
        }
        break;
    }
  }
  return escaped;
}

std::string Narrow(const std::wstring& value) {
  if (value.empty()) return {};
  const int length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS,
                                         value.data(), static_cast<int>(value.size()),
                                         nullptr, 0, nullptr, nullptr);
  if (length <= 0) return {};
  std::string output(static_cast<size_t>(length), '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), output.data(), length,
                      nullptr, nullptr);
  return output;
}

void Emit(const std::string& type, const std::string& requestId = {},
          HRESULT result = S_OK, const std::string& extra = {}) {
  static std::mutex outputMutex;
  std::lock_guard<std::mutex> lock(outputMutex);
  std::cout << "{\"schemaVersion\":1,\"type\":\"" << JsonEscape(type)
            << "\",\"requestId\":\"" << JsonEscape(requestId)
            << "\",\"ok\":" << (SUCCEEDED(result) ? "true" : "false");
  if (FAILED(result)) {
    std::cout << ",\"error\":{\"code\":\"" << HResultCode(result)
              << "\",\"message\":\"Media Foundation operation failed\"}";
  }
  if (!extra.empty()) std::cout << ',' << extra;
  std::cout << "}\n" << std::flush;
}

class MediaFoundationPlayer;

class SessionCallback final : public IMFAsyncCallback {
 public:
  explicit SessionCallback(MediaFoundationPlayer* owner) : owner_(owner) {}

  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** object) override;
  ULONG STDMETHODCALLTYPE AddRef() override {
    return ++referenceCount_;
  }
  ULONG STDMETHODCALLTYPE Release() override {
    const ULONG remaining = --referenceCount_;
    if (remaining == 0) delete this;
    return remaining;
  }
  HRESULT STDMETHODCALLTYPE GetParameters(DWORD*, DWORD*) override {
    return E_NOTIMPL;
  }
  HRESULT STDMETHODCALLTYPE Invoke(IMFAsyncResult* result) override;

  void Detach() { owner_ = nullptr; }

 private:
  std::atomic<ULONG> referenceCount_{1};
  MediaFoundationPlayer* owner_;
};

class MediaFoundationPlayer final {
 public:
  MediaFoundationPlayer() = default;
  ~MediaFoundationPlayer() { Close(); }

  HRESULT Open(const std::wstring& sourcePath, HWND targetWindow) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (session_) return MF_E_INVALIDREQUEST;
    if (sourcePath.empty() || targetWindow == nullptr) return E_INVALIDARG;
    if (GetFileAttributesW(sourcePath.c_str()) == INVALID_FILE_ATTRIBUTES) {
      return HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND);
    }

    parentWindow_ = targetWindow;
    HRESULT surfaceResult = CreateRenderSurface(targetWindow);
    if (FAILED(surfaceResult)) return surfaceResult;

    HRESULT result = MFStartup(MF_VERSION, MFSTARTUP_FULL);
    if (FAILED(result)) return result;
    mfStarted_ = true;

    callback_.Attach(new SessionCallback(this));
    result = MFCreateMediaSession(nullptr, &session_);
    if (FAILED(result)) return result;
    result = session_->BeginGetEvent(callback_.Get(), nullptr);
    if (FAILED(result)) return result;

    ComPtr<IMFSourceResolver> resolver;
    MF_OBJECT_TYPE objectType = MF_OBJECT_INVALID;
    ComPtr<IUnknown> sourceUnknown;
    result = MFCreateSourceResolver(&resolver);
    if (SUCCEEDED(result)) {
      result = resolver->CreateObjectFromURL(
          sourcePath.c_str(), MF_RESOLUTION_MEDIASOURCE, nullptr,
          &objectType, &sourceUnknown);
    }
    if (FAILED(result)) return result;
    result = sourceUnknown.As(&source_);
    if (FAILED(result)) return result;

    ComPtr<IMFPresentationDescriptor> presentation;
    result = source_->CreatePresentationDescriptor(&presentation);
    if (FAILED(result)) return result;

    ComPtr<IMFStreamDescriptor> videoStream;
    DWORD streamCount = 0;
    result = presentation->GetStreamDescriptorCount(&streamCount);
    if (FAILED(result)) return result;
    for (DWORD index = 0; index < streamCount; ++index) {
      BOOL selected = FALSE;
      ComPtr<IMFStreamDescriptor> stream;
      result = presentation->GetStreamDescriptorByIndex(index, &selected, &stream);
      if (FAILED(result)) return result;
      ComPtr<IMFMediaTypeHandler> handler;
      GUID majorType = GUID_NULL;
      if (SUCCEEDED(stream->GetMediaTypeHandler(&handler))
          && SUCCEEDED(handler->GetMajorType(&majorType))
          && majorType == MFMediaType_Video) {
        videoStream = stream;
        videoStreamIndex_ = index;
        UINT64 duration = 0;
        presentation->GetUINT64(MF_PD_DURATION, &duration);
        duration100ns_ = static_cast<LONGLONG>(duration);
        ComPtr<IMFMediaType> mediaType;
        if (SUCCEEDED(handler->GetCurrentMediaType(&mediaType))) {
          UINT32 numerator = 0;
          UINT32 denominator = 1;
          if (SUCCEEDED(MFGetAttributeRatio(mediaType.Get(), MF_MT_FRAME_RATE,
                                            &numerator, &denominator))
              && numerator > 0 && denominator > 0) {
            fps_ = static_cast<double>(numerator) / static_cast<double>(denominator);
          }
        }
        frameCount_ = std::max<LONGLONG>(1, static_cast<LONGLONG>(std::ceil(
            (static_cast<double>(duration100ns_) / kHundredNanosecondsPerSecond) * fps_)));
        break;
      }
    }
    if (!videoStream) return MF_E_INVALIDMEDIATYPE;
    // The presentation descriptor may expose the video stream as unselected
    // (for example when the source also contains audio). Select the stream
    // explicitly before building the source topology; otherwise the Media
    // Session can wait forever for a topology that has no active video path.
    result = presentation->SelectStream(videoStreamIndex_);
    if (FAILED(result)) return result;

    ComPtr<IMFTopology> topology;
    result = MFCreateTopology(&topology);
    if (FAILED(result)) return result;
    ComPtr<IMFTopologyNode> sourceNode;
    ComPtr<IMFTopologyNode> outputNode;
    result = MFCreateTopologyNode(MF_TOPOLOGY_SOURCESTREAM_NODE, &sourceNode);
    if (SUCCEEDED(result)) result = sourceNode->SetUnknown(MF_TOPONODE_SOURCE, source_.Get());
    if (SUCCEEDED(result)) result = sourceNode->SetUnknown(
        MF_TOPONODE_PRESENTATION_DESCRIPTOR, presentation.Get());
    if (SUCCEEDED(result)) result = sourceNode->SetUnknown(
        MF_TOPONODE_STREAM_DESCRIPTOR, videoStream.Get());
    if (FAILED(result)) return result;

    ComPtr<IMFActivate> rendererActivate;
    result = MFCreateVideoRendererActivate(renderWindow_, &rendererActivate);
    if (SUCCEEDED(result)) result = MFCreateTopologyNode(
        MF_TOPOLOGY_OUTPUT_NODE, &outputNode);
    // Keep the activation object on the partial topology. The Media Session
    // must activate EVR itself while resolving the topology; pre-activating a
    // sink here bypasses the session-owned presenter services and prevents
    // scrub/frame-step completion from reaching the session event queue.
    if (SUCCEEDED(result)) result = outputNode->SetObject(rendererActivate.Get());
    // EVR exposes a single video stream sink with stream id 0. The source
    // descriptor index may be 1 (when audio is listed first), but that index
    // must not be copied to the renderer sink node.
    if (SUCCEEDED(result)) result = outputNode->SetUINT32(
        MF_TOPONODE_STREAMID, 0);
    if (SUCCEEDED(result)) result = outputNode->SetUINT32(
        MF_TOPONODE_NOSHUTDOWN_ON_REMOVE, FALSE);
    if (SUCCEEDED(result)) result = topology->AddNode(sourceNode.Get());
    if (SUCCEEDED(result)) result = topology->AddNode(outputNode.Get());
    if (SUCCEEDED(result)) result = sourceNode->ConnectOutput(0, outputNode.Get(), 0);
    if (FAILED(result)) return result;

    result = session_->SetTopology(0, topology.Get());
    if (FAILED(result)) return result;
    // A newly-created Media Session is stopped. SetTopology is asynchronous
    // and a stopped session does not resolve the queued topology until Start
    // is called, so kick the session once at position zero before waiting for
    // MF_TOPOSTATUS_READY. The bridge switches to rate=0 before exposing the
    // opened state, leaving the first decoded sample paused for the editor.
    PROPVARIANT initialPosition;
    PropVariantInit(&initialPosition);
    initialPosition.vt = VT_EMPTY;
    result = session_->Start(&GUID_NULL, &initialPosition);
    PropVariantClear(&initialPosition);
    if (FAILED(result)) return result;

    // EVR exposes frame stepping through its render service.  Querying it is
    // intentionally best-effort: codecs without EVR frame-step support remain
    // open, but the bridge returns FRAME_STEP_UNSUPPORTED for that operation.
    std::unique_lock<std::mutex> readyLock(readyMutex_);
    const bool ready = readyCondition_.wait_for(
        readyLock, std::chrono::milliseconds(kOpenTimeoutMs),
        [this] { return topologyReady_ || terminalError_ != S_OK; });
    if (!ready) return HRESULT_FROM_WIN32(ERROR_TIMEOUT);
    if (terminalError_ != S_OK) return terminalError_;
    readyLock.unlock();
    // IMFRateControl is exposed as a Media Session service, not necessarily
    // through QueryInterface on the session object. Query it after topology
    // readiness so the service graph is fully initialized.
    const HRESULT rateResult = MFGetService(session_.Get(), MF_RATE_CONTROL_SERVICE,
                                            IID_PPV_ARGS(&rateControl_));
    if (FAILED(rateResult)) return rateResult;
    // Query EVR services only after the Media Session has resolved and
    // activated the topology. Before that point the presenter does not exist.
    MFGetService(session_.Get(), kMrVideoRenderService,
                 IID_PPV_ARGS(&frameStep_));
    const HRESULT scrubResult = rateControl_->SetRate(FALSE, 0.0f);
    if (FAILED(scrubResult)) return scrubResult;
    // Pause is asynchronous. Wait for its completion before emitting
    // `opened`, otherwise an immediate first pointer seek can race the state
    // transition and lose its scrub completion event.
    {
      std::lock_guard<std::mutex> lock(readyMutex_);
      paused_ = false;
    }
    const HRESULT pauseResult = session_->Pause();
    if (FAILED(pauseResult)) return pauseResult;
    std::unique_lock<std::mutex> pauseLock(readyMutex_);
    const bool paused = readyCondition_.wait_for(
        pauseLock, std::chrono::milliseconds(kOpenTimeoutMs),
        [this] { return paused_ || terminalError_ != S_OK; });
    if (!paused) return HRESULT_FROM_WIN32(ERROR_TIMEOUT);
    return terminalError_ == S_OK ? S_OK : terminalError_;
  }

  HRESULT BeginScrubLocked(LONGLONG position, const std::string& requestId) {
    if (!session_ || !rateControl_) return MF_E_NOT_INITIALIZED;
    if (position < 0) return E_INVALIDARG;
    if (frameStep_) frameStep_->CancelStep();
    HRESULT result = rateControl_->SetRate(FALSE, 0.0f);
    if (SUCCEEDED(result)) {
      PROPVARIANT startPosition;
      PropVariantInit(&startPosition);
      result = InitPropVariantFromInt64(position, &startPosition);
      if (SUCCEEDED(result)) {
        pendingScrubRequest_ = requestId;
        result = session_->Start(&GUID_NULL, &startPosition);
      }
      PropVariantClear(&startPosition);
    }
    if (FAILED(result)) pendingScrubRequest_.clear();
    return result;
  }

  HRESULT Scrub(LONGLONG position, const std::string& requestId) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!session_ || !rateControl_) return MF_E_NOT_INITIALIZED;
    if (position < 0) return E_INVALIDARG;
    // Media Session seek requests are FIFO. Stop the current scrub before
    // starting a newer pointer position, and keep only that newest request;
    // otherwise a fast drag would decode every stale position in sequence.
    if (!pendingScrubRequest_.empty()) {
      queuedScrubRequest_ = requestId;
      queuedScrubPosition_ = position;
      HRESULT result = S_OK;
      if (!stopForScrub_) {
        stopForScrub_ = true;
        result = session_->Stop();
      }
      if (SUCCEEDED(result)) {
        Emit("scrub-submitted", requestId, S_OK,
             "\"rate\":0,\"position100ns\":" + std::to_string(position)
             + ",\"queued\":true");
      }
      return result;
    }
    const HRESULT result = BeginScrubLocked(position, requestId);
    if (SUCCEEDED(result)) {
      Emit("scrub-submitted", requestId, result,
           "\"rate\":0,\"position100ns\":" + std::to_string(position));
    }
    return result;
  }

  HRESULT SetBounds(int x, int y, int width, int height, double devicePixelRatio,
                    const std::string& requestId) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!renderWindow_ || devicePixelRatio < 0.25 || devicePixelRatio > 8.0) return MF_E_NOT_INITIALIZED;
    const int scaledX = static_cast<int>(x * devicePixelRatio);
    const int scaledY = static_cast<int>(y * devicePixelRatio);
    const int scaledWidth = std::max(1, static_cast<int>(width * devicePixelRatio));
    const int scaledHeight = std::max(1, static_cast<int>(height * devicePixelRatio));
    if (!MoveWindow(renderWindow_, scaledX, scaledY, scaledWidth, scaledHeight, TRUE)) {
      const HRESULT error = HRESULT_FROM_WIN32(GetLastError());
      Emit("bounds-applied", requestId, error);
      return error;
    }
    Emit("bounds-applied", requestId, S_OK,
         "\"x\":" + std::to_string(scaledX) + ",\"y\":" + std::to_string(scaledY)
         + ",\"width\":" + std::to_string(scaledWidth)
         + ",\"height\":" + std::to_string(scaledHeight));
    return S_OK;
  }

  HRESULT FrameStep(bool forward, const std::string& requestId) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!frameStep_ || !rateControl_) return MF_E_NOT_INITIALIZED;
    HRESULT result = rateControl_->SetRate(FALSE, 0.0f);
    if (SUCCEEDED(result)) result = frameStep_->CanStep(FALSE, nullptr);
    if (SUCCEEDED(result)) {
      // EVR's frame-step operation is forward-only.  A backwards request is
      // represented by CancelStep + a scrub command from the caller, keeping
      // the contract honest instead of pretending that EVR supports reverse.
      if (!forward) return E_NOTIMPL;
      result = frameStep_->Step(1, nullptr);
    }
    Emit("frame-step-submitted", requestId, result,
         "\"direction\":\"" + std::string(forward ? "forward" : "backward") + "\"");
    return result;
  }

  HRESULT CancelFrameStep(const std::string& requestId) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!frameStep_) return MF_E_NOT_INITIALIZED;
    const HRESULT result = frameStep_->CancelStep();
    Emit("frame-step-cancelled", requestId, result);
    return result;
  }

  HRESULT Play(float rate, const std::string& requestId) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!session_ || !rateControl_ || rate <= 0.0f || rate > 16.0f) return E_INVALIDARG;
    HRESULT result = rateControl_->SetRate(FALSE, rate);
    if (SUCCEEDED(result)) {
      PROPVARIANT startPosition;
      PropVariantInit(&startPosition);
      startPosition.vt = VT_EMPTY;
      result = session_->Start(&GUID_NULL, &startPosition);
      PropVariantClear(&startPosition);
    }
    Emit("play", requestId, result, "\"rate\":" + std::to_string(rate));
    return result;
  }

  HRESULT Pause(const std::string& requestId) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!session_) return MF_E_NOT_INITIALIZED;
    const HRESULT result = session_->Pause();
    Emit("pause", requestId, result);
    return result;
  }

  HRESULT Stop(const std::string& requestId) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!session_) return MF_E_NOT_INITIALIZED;
    if (frameStep_) frameStep_->CancelStep();
    const HRESULT result = session_->Stop();
    Emit("stop", requestId, result);
    return result;
  }

  void Close() {
    std::lock_guard<std::mutex> lock(mutex_);
    if (callback_) callback_->Detach();
    if (session_) {
      session_->Close();
      session_.Reset();
    }
    frameStep_.Reset();
    rateControl_.Reset();
    source_.Reset();
    callback_.Reset();
    if (mfStarted_) {
      MFShutdown();
      mfStarted_ = false;
    }
    topologyReady_ = false;
    paused_ = false;
    pendingScrubRequest_.clear();
    queuedScrubRequest_.clear();
    queuedScrubPosition_ = 0;
    stopForScrub_ = false;
    terminalError_ = S_OK;
    if (renderWindow_) {
      DestroyWindow(renderWindow_);
      renderWindow_ = nullptr;
    }
    parentWindow_ = nullptr;
  }

  LONGLONG FrameCount() const { return frameCount_; }
  double Fps() const { return fps_; }
  double DurationSeconds() const {
    return static_cast<double>(duration100ns_) / kHundredNanosecondsPerSecond;
  }

  void OnSessionEvent(IMFMediaEvent* event) {
    MediaEventType type = MEUnknown;
    if (FAILED(event->GetType(&type))) return;
    if (type == MESessionTopologyStatus) {
      UINT32 status = MF_TOPOSTATUS_INVALID;
      event->GetUINT32(MF_EVENT_TOPOLOGY_STATUS, &status);
      if (status == MF_TOPOSTATUS_READY) {
        {
          std::lock_guard<std::mutex> lock(readyMutex_);
          topologyReady_ = true;
        }
        readyCondition_.notify_all();
        Emit("ready");
      }
    } else if (type == MESessionScrubSampleComplete) {
      std::string requestId;
      {
        std::lock_guard<std::mutex> lock(mutex_);
        requestId = pendingScrubRequest_;
        pendingScrubRequest_.clear();
      }
      if (!requestId.empty()) {
        Emit("scrub-complete", requestId, S_OK,
             "\"rate\":0,\"completion\":\"MESessionScrubSampleComplete\"");
      }
    } else if (type == MESessionEnded) {
      Emit("ended");
    } else if (type == MESessionClosed) {
      Emit("closed");
    } else if (type == MESessionStarted) {
      // Some Media Foundation sources report MESessionStarted without a
      // separate MF_TOPOSTATUS_READY event for the first topology. Start is
      // still the documented completion boundary for the stopped session, so
      // treat it as ready for the open handshake.
      {
        std::lock_guard<std::mutex> lock(readyMutex_);
        topologyReady_ = true;
      }
      readyCondition_.notify_all();
      Emit("ready");
      Emit("started");
    } else if (type == MESessionPaused) {
      {
        std::lock_guard<std::mutex> lock(readyMutex_);
        paused_ = true;
      }
      readyCondition_.notify_all();
      Emit("paused");
    } else if (type == MESessionStopped) {
      std::string queuedRequest;
      LONGLONG queuedPosition = 0;
      HRESULT queuedResult = S_OK;
      {
        std::lock_guard<std::mutex> lock(mutex_);
        if (stopForScrub_ && !queuedScrubRequest_.empty()) {
          queuedRequest = queuedScrubRequest_;
          queuedPosition = queuedScrubPosition_;
          queuedScrubRequest_.clear();
          stopForScrub_ = false;
          queuedResult = BeginScrubLocked(queuedPosition, queuedRequest);
        }
      }
      if (!queuedRequest.empty()) {
        if (SUCCEEDED(queuedResult)) {
          Emit("scrub-submitted", queuedRequest, S_OK,
               "\"rate\":0,\"position100ns\":"
               + std::to_string(queuedPosition) + ",\"queued\":true");
        } else {
          Emit("command-failed", queuedRequest, queuedResult);
        }
      }
      Emit("stopped");
    } else if (type == MEError) {
      HRESULT error = S_OK;
      event->GetStatus(&error);
      {
        std::lock_guard<std::mutex> lock(readyMutex_);
        terminalError_ = error;
      }
      readyCondition_.notify_all();
      Emit("error", {}, error);
    }

    if (session_ && type != MESessionClosed) {
      session_->BeginGetEvent(callback_.Get(), nullptr);
    }
  }

 private:
  static LRESULT CALLBACK SurfaceWindowProc(HWND window, UINT message,
                                             WPARAM wParam, LPARAM lParam) {
    if (message == WM_NCHITTEST) return HTTRANSPARENT;
    return DefWindowProcW(window, message, wParam, lParam);
  }

  HRESULT CreateRenderSurface(HWND parent) {
    if (!IsWindow(parent)) return E_INVALIDARG;
    WNDCLASSW windowClass{};
    windowClass.lpfnWndProc = &MediaFoundationPlayer::SurfaceWindowProc;
    windowClass.hInstance = GetModuleHandleW(nullptr);
    windowClass.lpszClassName = kSurfaceClassName;
    windowClass.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(32512));
    RegisterClassW(&windowClass);
    renderWindow_ = CreateWindowExW(
        WS_EX_NOACTIVATE, kSurfaceClassName, L"", WS_CHILD | WS_VISIBLE
            | WS_CLIPSIBLINGS | WS_CLIPCHILDREN,
        0, 0, 1, 1, parent, nullptr, windowClass.hInstance, nullptr);
    return renderWindow_ ? S_OK : HRESULT_FROM_WIN32(GetLastError());
  }

  friend class SessionCallback;
  std::mutex mutex_;
  std::mutex readyMutex_;
  std::condition_variable readyCondition_;
  bool mfStarted_ = false;
  bool topologyReady_ = false;
  bool paused_ = false;
  HRESULT terminalError_ = S_OK;
  DWORD videoStreamIndex_ = 0;
  std::string pendingScrubRequest_;
  std::string queuedScrubRequest_;
  LONGLONG queuedScrubPosition_ = 0;
  bool stopForScrub_ = false;
  ComPtr<SessionCallback> callback_;
  ComPtr<IMFMediaSession> session_;
  ComPtr<IMFMediaSource> source_;
  ComPtr<IMFRateControl> rateControl_;
  ComPtr<IVideoFrameStep> frameStep_;
  HWND parentWindow_ = nullptr;
  HWND renderWindow_ = nullptr;
  LONGLONG duration100ns_ = 0;
  LONGLONG frameCount_ = 1;
  double fps_ = 30.0;
};

HRESULT STDMETHODCALLTYPE SessionCallback::QueryInterface(REFIID iid, void** object) {
  if (object == nullptr) return E_POINTER;
  *object = nullptr;
  if (iid == IID_IUnknown || iid == IID_IMFAsyncCallback) {
    *object = static_cast<IMFAsyncCallback*>(this);
    AddRef();
    return S_OK;
  }
  return E_NOINTERFACE;
}

HRESULT STDMETHODCALLTYPE SessionCallback::Invoke(IMFAsyncResult* result) {
  if (owner_ == nullptr) return S_OK;
  ComPtr<IMFMediaEvent> event;
  HRESULT status = owner_->session_->EndGetEvent(result, &event);
  if (SUCCEEDED(status) && event) owner_->OnSessionEvent(event.Get());
  return status;
}

std::string ExtractString(const std::string& input, const std::string& key) {
  const std::string marker = "\"" + key + "\"";
  const size_t keyPosition = input.find(marker);
  if (keyPosition == std::string::npos) return {};
  const size_t colon = input.find(':', keyPosition + marker.size());
  if (colon == std::string::npos) return {};
  const size_t quote = input.find('"', colon + 1);
  if (quote == std::string::npos) return {};
  const size_t end = input.find('"', quote + 1);
  if (end == std::string::npos) return {};
  return input.substr(quote + 1, end - quote - 1);
}

long long ExtractInteger(const std::string& input, const std::string& key, bool* found) {
  *found = false;
  const std::string marker = "\"" + key + "\"";
  const size_t keyPosition = input.find(marker);
  if (keyPosition == std::string::npos) return 0;
  const size_t colon = input.find(':', keyPosition + marker.size());
  if (colon == std::string::npos) return 0;
  char* end = nullptr;
  const long long value = std::strtoll(input.c_str() + colon + 1, &end, 10);
  if (end == input.c_str() + colon + 1) return 0;
  *found = true;
  return value;
}

double ExtractNumber(const std::string& input, const std::string& key, bool* found) {
  *found = false;
  const std::string marker = "\"" + key + "\"";
  const size_t keyPosition = input.find(marker);
  if (keyPosition == std::string::npos) return 0;
  const size_t colon = input.find(':', keyPosition + marker.size());
  if (colon == std::string::npos) return 0;
  char* end = nullptr;
  const double value = std::strtod(input.c_str() + colon + 1, &end);
  if (end == input.c_str() + colon + 1) return 0;
  *found = true;
  return value;
}

bool ExtractBoolean(const std::string& input, const std::string& key, bool fallback) {
  const std::string marker = "\"" + key + "\"";
  const size_t keyPosition = input.find(marker);
  if (keyPosition == std::string::npos) return fallback;
  const size_t colon = input.find(':', keyPosition + marker.size());
  if (colon == std::string::npos) return fallback;
  const std::string tail = input.substr(colon + 1);
  if (tail.find("true") != std::string::npos) return true;
  if (tail.find("false") != std::string::npos) return false;
  return fallback;
}

HWND ParseWindowHandle(const std::wstring& value) {
  if (value.empty()) return nullptr;
  wchar_t* end = nullptr;
  const unsigned long long number = std::wcstoull(value.c_str(), &end, 16);
  if (end == value.c_str() || *end != L'\0') return nullptr;
  return reinterpret_cast<HWND>(static_cast<uintptr_t>(number));
}

int Run(const std::wstring& sourcePath, HWND targetWindow) {
  HRESULT comResult = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(comResult)) {
    Emit("error", {}, comResult);
    return 1;
  }

  MediaFoundationPlayer player;
  HRESULT openResult = player.Open(sourcePath, targetWindow);
  if (FAILED(openResult)) {
    Emit("open-failed", {}, openResult);
    CoUninitialize();
    return 2;
  }
  Emit("opened", {}, S_OK,
       "\"frameCount\":" + std::to_string(player.FrameCount())
       + ",\"fps\":" + std::to_string(player.Fps())
       + ",\"durationSeconds\":" + std::to_string(player.DurationSeconds()));

  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.size() > 4096) {
      Emit("command-rejected", {}, E_INVALIDARG);
      continue;
    }
    const std::string command = ExtractString(line, "command");
    const std::string requestId = ExtractString(line, "requestId");
    HRESULT result = E_INVALIDARG;
    if (command == "scrub") {
      bool found = false;
      const long long position = ExtractInteger(line, "position100ns", &found);
      result = found ? player.Scrub(position, requestId) : E_INVALIDARG;
    } else if (command == "set-bounds") {
      bool xFound = false;
      bool yFound = false;
      bool widthFound = false;
      bool heightFound = false;
      bool dprFound = false;
      const long long x = ExtractInteger(line, "x", &xFound);
      const long long y = ExtractInteger(line, "y", &yFound);
      const long long width = ExtractInteger(line, "width", &widthFound);
      const long long height = ExtractInteger(line, "height", &heightFound);
      const double dpr = ExtractNumber(line, "devicePixelRatio", &dprFound);
      if (xFound && yFound && widthFound && heightFound && dprFound
          && x >= -100000 && x <= 100000 && y >= -100000 && y <= 100000
          && width > 0 && width <= 16384 && height > 0 && height <= 16384) {
        result = player.SetBounds(static_cast<int>(x), static_cast<int>(y),
                                  static_cast<int>(width), static_cast<int>(height),
                                  dpr, requestId);
      } else {
        result = E_INVALIDARG;
      }
    } else if (command == "frame-step") {
      result = player.FrameStep(ExtractBoolean(line, "forward", true), requestId);
    } else if (command == "cancel-frame-step") {
      result = player.CancelFrameStep(requestId);
    } else if (command == "play") {
      bool found = false;
      const long long rate100 = ExtractInteger(line, "rate100", &found);
      result = found ? player.Play(static_cast<float>(rate100) / 100.0f, requestId)
                     : player.Play(1.0f, requestId);
    } else if (command == "pause") {
      result = player.Pause(requestId);
    } else if (command == "stop") {
      result = player.Stop(requestId);
    } else if (command == "close") {
      player.Close();
      Emit("closed", requestId);
      break;
    } else {
      Emit("command-rejected", requestId, E_INVALIDARG);
      continue;
    }
    if (FAILED(result) && command != "frame-step" && command != "play"
        && command != "pause" && command != "stop") {
      Emit("command-failed", requestId, result);
    }
  }

  player.Close();
  CoUninitialize();
  return 0;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  // Usage: media-foundation-player.exe --source <absolute-path> --hwnd <hex>
  std::wstring sourcePath;
  std::wstring windowValue;
  for (int index = 1; index + 1 < argc; ++index) {
    if (std::wcscmp(argv[index], L"--source") == 0) sourcePath = argv[++index];
    else if (std::wcscmp(argv[index], L"--hwnd") == 0) windowValue = argv[++index];
  }
  const HWND targetWindow = ParseWindowHandle(windowValue);
  if (sourcePath.empty() || targetWindow == nullptr) {
    Emit("open-failed", {}, E_INVALIDARG);
    return 2;
  }
  return Run(sourcePath, targetWindow);
}
