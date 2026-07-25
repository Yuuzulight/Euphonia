"""Smoke test for analyze.py's resolve_paths(). Run directly: `uv run scripts/test_analyze_paths.py`."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from analyze import resolve_paths, ROOT


def test_default_paths_unchanged():
    p = resolve_paths(None)
    assert p.recordings_json == ROOT / "recordings.json"
    assert p.mirror_recordings_json == ROOT / "dashboard-react" / "public" / "recordings.json"
    assert p.audio_dir == ROOT / "dashboard-react" / "public" / "audio"
    assert p.analysis_dir == ROOT / "dashboard-react" / "public" / "analysis"


def test_output_root_single_location():
    p = resolve_paths("/tmp/voicegarden-userdata")
    root = Path("/tmp/voicegarden-userdata")
    assert p.recordings_json == root / "recordings.json"
    assert p.mirror_recordings_json is None
    assert p.audio_dir == root / "audio"
    assert p.analysis_dir == root / "analysis"


if __name__ == "__main__":
    test_default_paths_unchanged()
    test_output_root_single_location()
    print("[OK] resolve_paths tests passed")
