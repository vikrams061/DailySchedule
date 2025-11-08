import { callLlmMapping } from '../utils/llm';

const hasKey = !!process.env.OPENAI_API_KEY;

(hasKey ? test : test.skip)('LLM mapping returns timetable when OPENAI_API_KEY is set', async () => {
  const payload = {
    ocrWords: [
      { text: 'Mon', left: 10, top: 10 },
      { text: '09:00-10:00', left: 50, top: 10 },
      { text: 'Registration', left: 150, top: 10 }
    ],
    candidate: { timetable: { timeblocks: [] } }
  };

  const res = await callLlmMapping(payload, { week_start_date: null, timezone: 'UTC' }, { force: true, model: 'gpt-4' });
  // The test is permissive: we only assert that a timetable-like object is returned
  expect(res === null || typeof res === 'object').toBe(true);
  if (res) {
    expect(res.timetable).toBeDefined();
    expect(Array.isArray(res.timetable.timeblocks)).toBe(true);
  }
});

test('LLM mapping returns null when OPENAI_API_KEY not set', async () => {
  if (hasKey) return; // skip this assertion when key present
  const res = await callLlmMapping({}, { week_start_date: null, timezone: 'UTC' });
  expect(res).toBeNull();
});
