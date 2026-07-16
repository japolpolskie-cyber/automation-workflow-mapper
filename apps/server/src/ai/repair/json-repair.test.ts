import { describe, expect, it } from 'vitest';
import { parseJsonWithRepair } from './json-repair.js';

describe('parseJsonWithRepair', () => {
  it('parses valid JSON directly', () => { expect(parseJsonWithRepair('{"ok":true}')).toEqual({ ok: true }); });
  it('removes markdown fences and trailing commas', () => { expect(parseJsonWithRepair('```json\n{"ok": true,}\n```')).toEqual({ ok: true }); });
  it('rejects output without a JSON object', () => { expect(() => parseJsonWithRepair('No structured output')).toThrow(/JSON object/); });
});
