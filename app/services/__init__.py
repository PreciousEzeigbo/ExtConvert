from pathlib import Path

from app.services.conversion_service import ConversionService


BASE_DIR = Path(__file__).resolve().parents[2]
conversion_service = ConversionService(BASE_DIR)
