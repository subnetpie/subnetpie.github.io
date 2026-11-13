"""Prepare a pinned upstream checkout for the DMD Viewer WASM derivative.

Usage: python emulator/prepare-build.py /path/to/pinmame
Then configure using emcmake cmake -S <core> -B <build> -G Ninja ...
The upstream checkout is disposable; the patch never touches user ROMs.
"""
from pathlib import Path
import shutil
import sys

core = Path(sys.argv[1]).resolve()
source = Path(__file__).resolve().parent
cmake = (core / 'cmake/libpinmame/CMakeLists.txt').read_text()
cmake += '''
# DMD Viewer browser derivative: threads for the synchronous emulation loop.
target_include_directories(pinmame_static PRIVATE ${CMAKE_SOURCE_DIR}/ext/zlib)
target_compile_options(pinmame_static PRIVATE -pthread -Wno-error=implicit-function-declaration -Wno-error=incompatible-pointer-types)
add_executable(dmd-runtime viewer-bridge.cpp)
target_link_libraries(dmd-runtime PRIVATE pinmame_static)
target_include_directories(dmd-runtime PRIVATE ${CMAKE_SOURCE_DIR})
target_compile_options(dmd-runtime PRIVATE -pthread)
target_link_options(dmd-runtime PRIVATE
  -pthread --no-entry -sMODULARIZE=1 -sEXPORT_ES6=1
  -sWASMFS=1 -sFORCE_FILESYSTEM=1
  -sPTHREAD_POOL_SIZE=2 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=134217728
  -sMAXIMUM_MEMORY=536870912 -sSTACK_SIZE=2097152
  -sEXPORTED_RUNTIME_METHODS=FS,ccall,UTF8ToString,HEAPU8,HEAP32,HEAPF32,PThread
  -sINCOMING_MODULE_JS_API=wasmBinary,print,printErr,onAbort,locateFile
  -sEXPORTED_FUNCTIONS=_malloc,_free
  -sENVIRONMENT=web,worker,node)
set_target_properties(dmd-runtime PROPERTIES SUFFIX ".mjs")
'''
(core / 'CMakeLists.txt').write_text(cmake)
shutil.copyfile(source / 'viewer-bridge.cpp', core / 'viewer-bridge.cpp')
core_file = core / 'src/wpc/core.c'
core_text = core_file.read_text()
marker = '// DMD Viewer: expose native identification planes to the browser colorizer.'
signature = 'void core_dmd_send_libpinmame(const core_tLCDLayout* dmdLayout, const float* const dmdDotLum, const UINT8* const dmdDotRaw) {'
hook = '''
   // DMD Viewer: expose native identification planes to the browser colorizer.
   extern void viewer_capture_planes(const unsigned char*, int, int);
   UINT8 viewerPlanes[5 * 2048];
   int viewerCount = 0, viewerSize = 0;
   if (core_gameData->gen & (GEN_ALLWPC | GEN_GTS3 | GEN_ALVG_DMD2)) {
      core_tDMDPWMState* state = locals.dmdStates[dmdLayout->index];
      if (state && state->nFrames > 0 && state->rawFrameSize <= 2048) {
         viewerCount = state->nFrames < 5 ? state->nFrames : 5;
         viewerSize = state->rawFrameSize;
         for (int f = 0; f < viewerCount; f++) {
            const int slot = (state->nextFrame + 2 * state->nFrames - 1 - f) % state->nFrames;
            const UINT8* input = state->rawFrames + slot * viewerSize;
            for (int b = 0; b < viewerSize; b++)
               viewerPlanes[f * viewerSize + b] = state->revByte ? input[b] : core_revbyte(input[b]);
         }
      }
   }
   viewer_capture_planes(viewerPlanes, viewerCount, viewerSize);
'''
if marker not in core_text:
    if signature not in core_text:
        raise RuntimeError('Upstream DMD callback changed; inspect before patching.')
    core_file.write_text(core_text.replace(signature, signature + hook))
print('Prepared', core)
