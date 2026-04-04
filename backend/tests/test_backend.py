import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image
from reportlab.pdfgen import canvas

from backend.app import main as main_module
from backend.app.converters import ConversionManager
from backend.app.routes import conversion_routes
from backend.app.services.conversion_service import ConversionService


def make_text_file(directory: Path, name: str, content: str) -> Path:
    path = directory / name
    path.write_text(content, encoding="utf-8")
    return path


def make_pdf_file(directory: Path, name: str, content: str = "Hello from PDF") -> Path:
    path = directory / name
    pdf = canvas.Canvas(str(path))
    pdf.drawString(72, 720, content)
    pdf.save()
    return path


def make_image_file(directory: Path, name: str = "sample.png") -> Path:
    path = directory / name
    image = Image.new("RGB", (64, 64), color=(40, 120, 200))
    image.save(path)
    return path


class BackendServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.tempdir.name)
        self.service = ConversionService(self.base_dir)

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_supported_formats_include_pdf_webp_and_txt_targets(self) -> None:
        formats = self.service.supported_formats()
        conversion_pairs = {(item["from"], item["to"]) for item in formats["conversions"]}

        self.assertIn(("pdf", "webp"), conversion_pairs)
        self.assertIn(("pdf", "txt"), conversion_pairs)
        self.assertIn(("txt", "pdf"), conversion_pairs)

    def test_create_batch_job_rejects_mismatched_file_ids(self) -> None:
        source = make_text_file(self.base_dir, "input.txt", "hello")
        upload = _upload_file(source)

        with self.assertRaisesRegex(Exception, "file_ids must match files length"):
            self._run_async(self.service.create_batch_job([upload], "pdf", file_ids=[]))

    def test_create_batch_job_rejects_invalid_file_id(self) -> None:
        source = make_text_file(self.base_dir, "input.txt", "hello")
        upload = _upload_file(source)

        with self.assertRaisesRegex(Exception, "Invalid file_id format"):
            self._run_async(self.service.create_batch_job([upload], "pdf", file_ids=["../bad"]))

    def test_unique_output_paths_preserve_readable_stem(self) -> None:
        first = self.service._build_unique_output_path("Quarterly report.txt", "pdf")
        first.write_text("one", encoding="utf-8")
        second = self.service._build_unique_output_path("Quarterly report.txt", "pdf")

        self.assertTrue(first.name.startswith("Quarterly report"))
        self.assertTrue(first.name.endswith(".pdf"))
        self.assertTrue(second.name.startswith("Quarterly report"))
        self.assertNotEqual(first.name, second.name)

    def test_resolve_output_by_filename_blocks_traversal(self) -> None:
        with self.assertRaisesRegex(Exception, "Invalid filename"):
            self.service.resolve_output_by_filename("../secret.txt")

    def test_full_batch_lifecycle_writes_history(self) -> None:
        source = make_text_file(self.base_dir, "note.txt", "ExtConvert backend test")
        upload = _upload_file(source)

        batch = self._run_async(self.service.create_batch_job([upload], "pdf", file_ids=["file_001"]))
        self._run_async(self.service.run_batch(batch["batch_id"]))

        job = self.service.get_job(batch["batch_id"])
        self.assertEqual(job.status.value, "done")
        self.assertEqual(job.results[0]["file_id"], "file_001")
        self.assertTrue((self.base_dir / "history" / "log.json").exists())
        self.assertGreaterEqual(len(self.service.load_history()), 1)

    def _run_async(self, value):
        import asyncio

        return asyncio.run(value)


class ConversionManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.tempdir.name)
        self.upload_dir = self.base_dir / "uploads"
        self.output_dir = self.base_dir / "outputs"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.manager = ConversionManager(self.upload_dir, self.output_dir)

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_txt_to_pdf_conversion_creates_output(self) -> None:
        source = make_text_file(self.base_dir, "source.txt", "TXT conversion test")
        out = self.manager.convert(str(source), ".txt", "pdf", "txt_001")

        self.assertTrue(Path(out).exists())
        self.assertTrue(out.endswith(".pdf"))

    def test_pdf_to_txt_conversion_creates_output(self) -> None:
        source = make_pdf_file(self.base_dir, "source.pdf", "PDF to text test")
        out = self.manager.convert(str(source), ".pdf", "txt", "pdf_001")

        self.assertTrue(Path(out).exists())
        self.assertTrue(out.endswith(".txt"))
        self.assertIn("PDF to text test", Path(out).read_text(encoding="utf-8"))

    def test_pdf_to_webp_conversion_creates_output(self) -> None:
        source = make_pdf_file(self.base_dir, "source-webp.pdf", "PDF to webp test")
        out = self.manager.convert(str(source), ".pdf", "webp", "pdf_webp_001")

        self.assertTrue(Path(out).exists())
        self.assertTrue(out.endswith(".webp"))

    def test_image_to_pdf_conversion_creates_output(self) -> None:
        source = make_image_file(self.base_dir, "source.png")
        out = self.manager.convert(str(source), ".png", "pdf", "img_001")

        self.assertTrue(Path(out).exists())
        self.assertTrue(out.endswith(".pdf"))


class ApiRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.tempdir.name)
        self.service = ConversionService(self.base_dir)
        self.patch = patch.object(conversion_routes, "conversion_service", self.service)
        self.patch.start()
        self.client = TestClient(main_module.app)

    def tearDown(self) -> None:
        self.patch.stop()
        self.tempdir.cleanup()

    def test_health_endpoint_reports_service_state(self) -> None:
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "healthy")
        self.assertEqual(payload["storage_backend"], "local")

    def test_formats_endpoint_exposes_supported_pairs(self) -> None:
        response = self.client.get("/api/formats")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn({"from": "pdf", "to": "webp", "label": "PDF -> WebP", "group": "doc_to_image"}, payload["conversions"])

    def test_history_clear_endpoint_empties_history(self) -> None:
        self.service.save_history({
            "batch_id": "batch-1",
            "target_format": "pdf",
            "total": 1,
            "completed": 1,
            "failed": 0,
            "created_at": "2026-04-04T00:00:00Z",
            "finished_at": "2026-04-04T00:01:00Z",
            "status": "done",
            "files": [],
        })

        clear_response = self.client.delete("/api/history")
        self.assertEqual(clear_response.status_code, 200)

        history_response = self.client.get("/api/history")
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(history_response.json(), [])

    def test_batch_upload_and_download_round_trip(self) -> None:
        source = make_text_file(self.base_dir, "roundtrip.txt", "round trip smoke")
        with source.open("rb") as handle:
            response = self.client.post(
                "/api/convert/batch?target_format=pdf",
                files={"files": (source.name, handle, "text/plain")},
                data={"file_ids": "route_file_001"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        batch_id = payload["batch_id"]

        status_payload = self._wait_for_job(batch_id)

        self.assertEqual(status_payload["status"], "done")
        self.assertEqual(status_payload["results"][0]["file_id"], "route_file_001")

        download_response = self.client.get(f"/api/jobs/{batch_id}/download/route_file_001")
        self.assertEqual(download_response.status_code, 200)
        self.assertGreater(len(download_response.content), 0)

    def _wait_for_job(self, batch_id: str) -> dict:
        for _ in range(30):
            response = self.client.get(f"/api/jobs/{batch_id}")
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            if payload["status"] in {"done", "partial", "failed"}:
                return payload

        self.fail(f"job {batch_id} did not finish in time")


def _upload_file(path: Path):
    return _SimpleUploadFile(path.name, path.read_bytes())


class _SimpleUploadFile:
    def __init__(self, filename: str, content: bytes):
        self.filename = filename
        self._content = BytesIO(content)

    async def read(self) -> bytes:
        return self._content.getvalue()


if __name__ == "__main__":
    unittest.main()