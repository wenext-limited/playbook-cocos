#!/usr/bin/env python3
"""Run a bundled skill script with Python bytecode writes disabled."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


SCRIPT_NAMES = {
    "query": "query_ck.py",
    "resolve": "resolve_scope.py",
}


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] not in SCRIPT_NAMES:
        choices = "|".join(SCRIPT_NAMES)
        print(f"Usage: python_runner.py <{choices}> [arguments...]", file=sys.stderr)
        return 2

    script = Path(__file__).resolve().parent / SCRIPT_NAMES[args[0]]
    environment = os.environ.copy()
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    command = [sys.executable, str(script), *args[1:]]
    try:
        return subprocess.run(command, env=environment, check=False).returncode
    except KeyboardInterrupt:
        return 130
    except OSError as error:
        print(f"Cannot start Python child process: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
