from pathlib import Path
import gzip
import shutil
import sys

build = Path(sys.argv[1]).resolve()
target = Path(__file__).resolve().parent.parent / 'dist/emulator'
target.mkdir(parents=True, exist_ok=True)
shutil.copyfile(build / 'dmd-runtime.mjs', target / 'dmd-runtime.mjs')
(target / 'dmd-runtime.wasm.gz').write_bytes(gzip.compress((build / 'dmd-runtime.wasm').read_bytes(), mtime=0))
print('Packaged runtime in', target)
