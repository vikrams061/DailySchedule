import { parseTimetableFromOcr } from '../utils/parser';

describe('parseTimetableFromOcr', () => {
  test('parses a simple single-line timetable row', () => {
    const ocr = {
      text: 'Mon 09:00-10:00 Registration',
      words: [
        { text: 'Mon', left: 10, top: 10, width: 20, height: 10 },
        { text: '09:00-10:00', left: 50, top: 10, width: 80, height: 10 },
        { text: 'Registration', left: 140, top: 10, width: 120, height: 10 }
      ]
    } as any;

    const res = parseTimetableFromOcr(ocr, { week_start_date: null, timezone: 'UTC' });
    expect(res).toHaveProperty('timeblocks');
    expect(Array.isArray(res.timeblocks)).toBe(true);
    expect(res.timeblocks.length).toBeGreaterThanOrEqual(1);
    const tb = res.timeblocks[0];
    expect(tb.start_time).toBe('09:00');
    expect(tb.end_time).toBe('10:00');
    expect(tb.normalized_title).toBe('Registration');
  });

  test('parses multiple lines and infers days', () => {
    const ocr = {
      text: 'Mon 09:00-10:00 Registration\nTue 10:00-11:00 Maths',
      words: [
        { text: 'Mon', left: 10, top: 10, width: 20, height: 10 },
        { text: '09:00-10:00', left: 50, top: 10, width: 80, height: 10 },
        { text: 'Registration', left: 140, top: 10, width: 120, height: 10 },

        { text: 'Tue', left: 10, top: 30, width: 20, height: 10 },
        { text: '10:00-11:00', left: 50, top: 30, width: 80, height: 10 },
        { text: 'Maths', left: 140, top: 30, width: 60, height: 10 }
      ]
    } as any;

    const res = parseTimetableFromOcr(ocr, { week_start_date: null, timezone: 'UTC' });
    expect(res.inferred_days.length).toBeGreaterThanOrEqual(2);
    expect(res.timeblocks.length).toBeGreaterThanOrEqual(2);
  });
});
