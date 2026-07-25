"""Freeze analyze.py into a standalone executable for packaging.

Usage: uv run scripts/build_sidecar.py
Output: dist-sidecar/analyze[.exe]
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--onefile",
            "--name",
            "analyze",
            "--distpath",
            str(ROOT / "dist-sidecar"),
            "--workpath",
            str(ROOT / "build-sidecar"),
            "--specpath",
            str(ROOT / "build-sidecar"),
            # parselmouth (Praat bindings) and numpy are C-extension-heavy —
            # PyInstaller's default import scan misses their compiled/data
            # payloads, so collect each fully rather than hoping hidden-import
            # guesses cover it.
            "--collect-all",
            "parselmouth",
            "--collect-all",
            "numpy",
            # Force UTF-8-safe stdio before analyze.py's emoji prints run — the
            # frozen bootloader ignores PYTHONIOENCODING on Windows (see the
            # hook file for why).
            "--runtime-hook",
            str(ROOT / "scripts" / "_rthook_utf8_stdio.py"),
            str(ROOT / "analyze.py"),
        ],
        check=True,
        cwd=ROOT,
    )
    # Plain ASCII: some Windows consoles (cp1252) can't encode emoji and would
    # otherwise crash here *after* a successful build.
    print("sidecar built at dist-sidecar/")


if __name__ == "__main__":
    main()
