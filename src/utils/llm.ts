import axios from 'axios';

type LlmOpts = { week_start_date?: string | null; timezone?: string };

function isTimetableLike(obj: any) {
  if (!obj || typeof obj !== 'object') return false;
  const t = obj.timetable;
  if (!t || typeof t !== 'object') return false;
  if (!Array.isArray(t.timeblocks)) return false;
  return true;
}

/**
 * Call an LLM (OpenAI) to map OCR data into the timetable schema.
 * Options:
 * - force: boolean - if true, attempt mapping even if candidate exists
 * - model: string - model id to use (default gpt-4)
 * - maxTokens: number
 * Returns parsed JSON { timetable: ... } or null on missing key/error/invalid response.
 */
export async function callLlmMapping(payload: { ocrText?: string; ocrWords?: any[]; candidate?: any }, opts: LlmOpts = {}, flags: { force?: boolean; model?: string; maxTokens?: number } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = flags.model || 'gpt-4';
  const maxTokens = flags.maxTokens || 800;

  // Build a compact preview of OCR words (limit to first 200 words)
  const preview = (payload.ocrWords || []).slice(0, 200).map((w: any) => ({ t: w.text, l: w.left, top: w.top }));

  const system = `You are a strict JSON generator that extracts timetable rows from OCR word data. Reply with valid JSON only.`;

  const userPrompt = `Schema: { week_start_date, timezone, inferred_days:[], timeblocks:[{ day_of_week, start_time, end_time, duration_minutes, original_text, normalized_title, notes, confidence }] }\nPreviewWords: ${JSON.stringify(preview)}\nCandidate: ${JSON.stringify(payload.candidate || {})}\nReturn: JSON only. Keep confidences between 0.0 and 1.0. If unsure about a field, set it to null.`;

  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.0,
      max_tokens: maxTokens
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });

    const content = res.data?.choices?.[0]?.message?.content;
    if (!content) return null;

    // Extract JSON substring conservatively
    const firstBrace = content.indexOf('{');
    if (firstBrace < 0) return null;
    const jsonText = content.slice(firstBrace);
    try {
      const parsed = JSON.parse(jsonText);
      if (isTimetableLike(parsed)) return parsed;
      return null;
    } catch (err) {
      return null;
    }
  } catch (err) {
    return null;
  }
}
