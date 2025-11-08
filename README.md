# Timetable Parser Prototype

Prototype Node.js + TypeScript server that accepts timetable files (image/pdf/docx), runs OCR and a heuristic parser, and returns structured timeblocks JSON.

API
- POST /api/v1/parse-timetable
  - multipart/form-data
  - fields:
    - file: file (image, pdf, docx)
    - week_start_date: optional ISO date
    - timezone: optional

Response (200): JSON
{
  "upload_id": "<uuid>",
  "timetable": { /* week_start_date, timezone, inferred_days, timeblocks[] */ }
}

Run (dev):
```powershell
npm install
npm run dev
```

Debug endpoint
----------------
For tuning OCR and parser heuristics there is a debug endpoint that returns the raw OCR JSON saved for a particular upload.

- GET /api/v1/uploads/:id/ocr
  - Response 200: JSON content of `tmp/uploads/:id/ocr.json` produced by the OCR step. Useful for inspecting word boxes and text to improve parser rules.

Example (PowerShell curl):
```powershell
curl 'http://localhost:3000/api/v1/uploads/abc123/ocr'
```

Sample `ocr.json` (trimmed) structure:
```json
{
  "text": "Mon 09:00-10:00 Registration\nMon 10:00-11:00 Maths",
  "words": [
    { "text": "Mon", "left": 50, "top": 20, "width": 30, "height": 12 },
    { "text": "09:00-10:00", "left": 100, "top": 20, "width": 80, "height": 12 },
    { "text": "Registration", "left": 200, "top": 20, "width": 120, "height": 12 }
  ]
}
```

Notes
- Use the OCR JSON to tune `src/utils/parser.ts` heuristics. The parser aggregates words by Y coordinate to produce lines and then detects time ranges via regex. If you find mislabeled rows, inspect the `words[]` positions to adjust `yTolerance` or column gap thresholds in the parser.

LLM integration
----------------
If `OPENAI_API_KEY` is set in the environment, the server will optionally call the LLM to produce a suggested timetable mapping. The LLM suggestion is returned as `llm_suggestion` in the `timetable` object unless the LLM's average confidence is high (>= 0.85), in which case it replaces the heuristic result.

To enable LLM mapping set the environment variable (example PowerShell):
```powershell
$env:OPENAI_API_KEY = 'sk-...'
# or persistently
setx OPENAI_API_KEY "sk-..."
```

Tests
-----
There is an integration test that calls the LLM; it runs only when `OPENAI_API_KEY` is present. Locally you can run all tests with:
```powershell
npm test
```

