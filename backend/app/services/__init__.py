import os
from pathlib import Path
from typing import Any

from backend.app.services.conversion_service import ConversionService


BASE_DIR = Path(__file__).resolve().parents[2]


def _load_env_file() -> None:
	candidate_env_files = [BASE_DIR / ".env", BASE_DIR.parent / ".env"]

	for env_path in candidate_env_files:
		if not env_path.exists():
			continue

		for raw_line in env_path.read_text(encoding="utf-8").splitlines():
			line = raw_line.strip()
			if not line or line.startswith("#") or "=" not in line:
				continue

			key, value = line.split("=", 1)
			key = key.strip()
			if not key:
				continue

			parsed = value.strip()
			if (parsed.startswith('"') and parsed.endswith('"')) or (
				parsed.startswith("'") and parsed.endswith("'")
			):
				parsed = parsed[1:-1]

			os.environ.setdefault(key, parsed)


_load_env_file()


class _LazyConversionService:
    def __init__(self, base_dir: Path):
        self._base_dir = base_dir
        self._instance: ConversionService | None = None

    def _get_instance(self) -> ConversionService:
        if self._instance is None:
            self._instance = ConversionService(self._base_dir)
        return self._instance

    def __getattr__(self, name: str) -> Any:
        return getattr(self._get_instance(), name)


conversion_service = _LazyConversionService(BASE_DIR)
