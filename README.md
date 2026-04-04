# ExtConvert

Batch file conversion built with FastAPI and React.

## Smoke Check

Run a live deployment check against the backend with:

```bash
python scripts/smoke_check.py --api-base-url https://your-backend.example.com
```

The script checks `/api/health`, submits a batch conversion, waits for completion, and verifies the download redirect.
