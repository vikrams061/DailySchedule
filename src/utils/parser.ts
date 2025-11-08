const WEEKDAYS = ['mon','tue','wed','thu','fri','sat','sun','monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function normalizeTime(t: string): string | null {
  if (!t) return null;
  t = t.trim();
  // normalize separators
  t = t.replace(/\./g, ':');
  // remove trailing am/pm for now and capture
  const ampm = /([ap]m)\b/i.exec(t);
  if (ampm) t = t.replace(/([ap]m)\b/i, '');
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  let hh = Number(m[1]);
  let mm = m[2] ? Number(m[2]) : 0;
  if (ampm) {
    const ap = ampm[1].toLowerCase();
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
  }
  if (hh >= 24) return null;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function parseTimeRangeFromText(t: string): {start: string | null, end: string | null} | null {
  // covers 09:00-10:00, 9-10, 09.00 - 10.00, 9:00am - 10:00am
  const re = /(\d{1,2}(?::\d{2}|\.\d{2})?\s*(?:am|pm)?)[\s]*[-–][\s]*(\d{1,2}(?::\d{2}|\.\d{2})?\s*(?:am|pm)?)/i;
  const m = t.match(re);
  if (!m) return null;
  const s = normalizeTime(m[1].replace(/\s+/g, ''));
  const e = normalizeTime(m[2].replace(/\s+/g, ''));
  return { start: s, end: e };
}

type OCRWord = { text: string; left: number; top: number; width: number; height: number };

function aggregateWordsToLines(words: OCRWord[], yTolerance = 8) {
  // Group words by approximate top coordinate
  const linesMap: { key: number; words: OCRWord[] }[] = [];
  for (const w of words) {
    // find existing line within tolerance
    let found = false;
    for (const l of linesMap) {
      if (Math.abs(l.key - w.top) <= yTolerance) {
        l.words.push(w);
        found = true;
        break;
      }
    }
    if (!found) linesMap.push({ key: w.top, words: [w] });
  }
  // sort lines by top and sort words by left
  const lines = linesMap.sort((a,b)=>a.key-b.key).map(l => {
    const ws = l.words.sort((a,b)=>a.left - b.left);
    return { top: l.key, text: ws.map(x=>x.text).join(' '), words: ws };
  });
  return lines;
}

function detectColumns(lines: { text: string; top: number; words: OCRWord[] }[]) {
  // heuristic: gather left positions of first word per line and see if there are multiple clusters
  const lefts = lines.map(l => (l.words[0] ? l.words[0].left : 0)).filter(x => x > 0);
  if (lefts.length < 2) return [0];
  // simple clustering by sorting and looking for big gaps
  lefts.sort((a,b)=>a-b);
  const gaps: {idx:number, gap:number}[] = [];
  for (let i=1;i<lefts.length;i++) gaps.push({ idx: i, gap: lefts[i]-lefts[i-1] });
  const large = gaps.filter(g => g.gap > 80); // threshold px
  if (large.length === 0) return [0];
  // construct column lefts at split points
  const cols = [lefts[0]];
  for (const g of large) cols.push(lefts[g.idx]);
  return cols;
}

export function parseTimetableFromOcr(ocr: { text: string; words: OCRWord[] }, opts: { week_start_date: string | null, timezone: string }) {
  const lines = aggregateWordsToLines(ocr.words || []);
  const inferred_days: string[] = [];
  const timeblocks: any[] = [];
  let currentDay = 'Mon';

  for (const ln of lines) {
    let line = ln.text.trim();
    if (!line) continue;
    // Detect and record a leading weekday token (Mon, Monday, Tue, etc.) then strip it
    const dayMatch = ln.text.trim().match(/^(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)/i);
    if (dayMatch) {
      const w = dayMatch[1].toLowerCase();
      currentDay = w.slice(0,3);
      const pretty = currentDay.charAt(0).toUpperCase() + currentDay.slice(1);
      if (!inferred_days.includes(pretty)) inferred_days.push(pretty);
    }
    // Strip leading weekday tokens to avoid titles containing day names
    line = line.replace(/^(mon(day)?|tue(sday)?|wed(nesday)?|thu(rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b[:\.]?\s*/i, '').trim();
    let low = line.toLowerCase();

    // Try to parse time in full line
    let tr = parseTimeRangeFromText(line);
    let title = '';
    if (!tr) {
      // try per-column: if first token looks like time, use rest as title
      const tokens = line.split(/\s+/);
      if (tokens.length > 1) {
        const maybe = parseTimeRangeFromText(tokens.slice(0,3).join(' '));
        if (maybe) {
          tr = maybe;
          title = tokens.slice(3).join(' ');
        }
      }
    } else {
      // remove time substring to get title
      title = line.replace(/(\d{1,2}(?::\d{2}|\.\d{2})?\s*(?:am|pm)?)[\s]*[-–][\s]*(\d{1,2}(?::\d{2}|\.\d{2})?\s*(?:am|pm)?)/i, '').trim();
    }

    if (tr) {
      let duration = null;
      if (tr.start && tr.end) {
        const [sh, sm] = tr.start.split(':').map(Number);
        const [eh, em] = tr.end.split(':').map(Number);
        const startMinutes = sh*60 + sm;
        const endMinutes = eh*60 + em;
        duration = endMinutes - startMinutes;
        if (duration <= 0) duration = null;
      }

      timeblocks.push({
        day_of_week: currentDay.charAt(0).toUpperCase() + currentDay.slice(1,3),
        start_time: tr.start,
        end_time: tr.end,
        duration_minutes: duration,
        original_text: line,
        normalized_title: title || null,
        notes: null,
        confidence: 0.75
      });
    }
  }

  // fallback: if no inferred days, include days from options or empty
  return {
    week_start_date: opts.week_start_date,
    timezone: opts.timezone,
    inferred_days,
    timeblocks
  };
}

// Keep text-only fallback
export function parseTimetableFromText(text: string, opts: { week_start_date: string | null, timezone: string }) {
  // Simple fallback: break into lines and call OCR-style parser with empty boxes
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const words = lines.flatMap((ln, idx) => ln.split(/\s+/).map((w, i) => ({ text: w, left: i*50, top: idx*12, width: w.length*6, height: 10 })));
  return parseTimetableFromOcr({ text, words }, opts);
}
