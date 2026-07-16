export function parseJsonWithRepair(value: string): unknown {
  const direct = tryParse(value);
  if (direct.ok) return direct.value;
  const unfenced = value.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = unfenced.indexOf('{'); const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI response did not contain a JSON object.');
  const candidate = unfenced.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
  const repaired = tryParse(candidate);
  if (!repaired.ok) throw new Error('AI response JSON could not be repaired.');
  return repaired.value;
}

function tryParse(value: string): { ok: true; value: unknown } | { ok: false } {
  try { return { ok: true, value: JSON.parse(value) as unknown }; } catch { return { ok: false }; }
}
