import { FastifyInstance } from 'fastify';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { saveUploadToFile } from '../utils/file';
import { ocrImage } from '../utils/ocr';
import { parseTimetableFromText, parseTimetableFromOcr } from '../utils/parser';
import { callLlmMapping } from '../utils/llm';
import mammoth from 'mammoth';
import { execFile } from 'child_process';
import { FastifyRequest } from 'fastify';
import { MultipartFile, Multipart } from '@fastify/multipart';

async function routes(fastify: FastifyInstance, opts: any) {
  fastify.post('/parse-timetable', async function (req, reply) {
    // accept multipart

const reqWithMultipart = req as FastifyRequest & Multipart;
const parts = reqWithMultipart.isMultipart() ? reqWithMultipart.parts() : null;    if (!parts) {
      return reply.status(400).send({ error: 'Request must be multipart/form-data' });
    }

    const uploadId = uuidv4();
    const uploadDir = path.join(process.cwd(), 'tmp', 'uploads', uploadId);
    await fs.promises.mkdir(uploadDir, { recursive: true });

    let filePath = '';
    let filename = '';
    let week_start_date: string | null = null;
    let timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    // Iterate parts - expect file field named 'file' and optional fields
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        filename = part.filename || 'upload.bin';
        const dest = path.join(uploadDir, filename);
        await saveUploadToFile(part.file, dest);
        filePath = dest;
      } else if (part.type === 'field') {
        if (part.fieldname === 'week_start_date') week_start_date = part.value as string;
        if (part.fieldname === 'timezone') timezone = (part.value as string) || timezone;
      }
    }

    if (!filePath) {
      return reply.status(400).send({ error: 'No file uploaded (field name must be file)' });
    }

    const ext = path.extname(filePath).toLowerCase();
    let ocrResult: { text: string; words?: any[] } = { text: '' };

    try {
      if (ext === '.pdf') {
        // convert first page to image using system pdftoppm (poppler). Requires pdftoppm available in PATH.
        const outputPrefix = path.join(uploadDir, 'page');
        try {
          await new Promise((resolve, reject) => {
            // -png : output PNG
            // -singlefile : produce a single output file (outputPrefix.png)
            // -f 1 -l 1 : first page only
            execFile('pdftoppm', ['-png', '-singlefile', '-f', '1', '-l', '1', filePath, outputPrefix], (err) => {
              if (err) return reject(err);
              resolve(null);
            });
          });
        } catch (err) {
          fastify.log.error({ msg: 'pdftoppm conversion failed', err });
          throw err;
        }
        const imagePath = outputPrefix + '.png';
        ocrResult = await ocrImage(imagePath);
      } else if (ext === '.docx') {
        const result = await mammoth.extractRawText({ path: filePath });
        ocrResult = { text: result.value };
      } else {
        // assume image
        ocrResult = await ocrImage(filePath);
      }
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Processing error', detail: err instanceof Error ? err.message : String(err) });
    }

    // Save OCR result for debugging
    try {
      await fs.promises.writeFile(path.join(uploadDir, 'ocr.json'), JSON.stringify(ocrResult, null, 2), 'utf8');
    } catch (err) {
      fastify.log.warn({ msg: 'Failed to save ocr.json', err });
    }

    // Heuristic parse using positional OCR when available
    let timetable = (ocrResult.words && ocrResult.words.length > 0)
      ? parseTimetableFromOcr(ocrResult as any, { week_start_date, timezone })
      : parseTimetableFromText(ocrResult.text || '', { week_start_date, timezone });

    // Optional LLM mapping: call if API key available and attach result (or replace if high confidence)
    try {
      const llm = await callLlmMapping({ ocrText: ocrResult.text, ocrWords: ocrResult.words, candidate: timetable }, { week_start_date, timezone });
      if (llm && llm.timetable) {
        // if LLM gives timeblocks with confidence and avg confidence high, trust it
        const tb = llm.timetable.timeblocks || [];
        const avgConf = tb.length ? (tb.reduce((s: number, t: any) => s + (t.confidence || 0), 0) / tb.length) : 0;
        if (avgConf >= 0.85) {
          timetable = llm.timetable;
        } else {
          // attach LLM suggestion for inspection
          (timetable as any).llm_suggestion = llm.timetable;
        }
      }
    } catch (err) {
      fastify.log.warn({ msg: 'LLM mapping failed', err });
    }

    return reply.send({ upload_id: uploadId, timetable });
  });

  // Debug endpoint: return saved OCR JSON for an upload id
  fastify.get('/uploads/:id/ocr', async function (req, reply) {
    const id = (req.params as any).id;
    const file = path.join(process.cwd(), 'tmp', 'uploads', id, 'ocr.json');
    try {
      const exists = await fs.promises.stat(file).then(() => true).catch(() => false);
      if (!exists) return reply.status(404).send({ error: 'Not found' });
      const txt = await fs.promises.readFile(file, 'utf8');
      return reply.type('application/json').send(JSON.parse(txt));
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Failed to read OCR data' });
    }
  });
}

export default routes;
