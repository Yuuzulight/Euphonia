# PyInstaller runtime hook, injected before analyze.py runs.
#
# analyze.py prints emoji status lines (see its main()). A normal `python`/
# `uv run` process honors PYTHONIOENCODING=utf-8 (which electron/src/sidecar.ts
# already sets when spawning the sidecar) and prints them fine. The frozen
# --onefile bootloader on Windows does NOT: its console/pipe stdio streams get
# bound to the process's ANSI codepage (cp1252 on this en-US machine)
# regardless of PYTHONIOENCODING/PYTHONUTF8, so the first emoji print raises
# UnicodeEncodeError and the whole run aborts before writing any output.
# Reconfiguring here — before analyze.py's own top-level code executes — fixes
# it without touching analyze.py itself.
import sys

for _stream in (sys.stdout, sys.stderr):
    if _stream is not None and hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")
