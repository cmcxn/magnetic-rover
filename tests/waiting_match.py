"""Compatibility entrypoint for the current multi-room real-time acceptance suite.

The former single-room waiting-queue contract was removed. All full-match,
readiness, spectator and 100-second + 10-second checks now live in multi_room.py.
Run this entrypoint with the same arguments as tests/multi_room.py.
"""
from pathlib import Path
import runpy

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('multi_room.py')), run_name='__main__')
