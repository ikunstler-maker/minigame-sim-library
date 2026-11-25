import type { CodeScript } from './script';

/** One user-editable value (key, UI label, reference default). */
export interface EditableValue { key: string; label: string; default: number }

/** The values a user may override, in script order. Derived values are not listed. */
export function editableValues(script: CodeScript): EditableValue[] {
  return script.values.map((v) => ({ key: v.key, label: v.label, default: v.default }));
}

const cents = (v: number): number => Math.round(v * 100) / 100;

/**
 * Configured values (overrides over script defaults) plus derived values:
 * - `whirl:step{i}`: whirl value after collect i = whirlFinal x runningSum_i / sum of
 *   the collected coins (reference 200/350/450/500/900 for final 900).
 * - `total:step{i}`: running sum of the collected values in `collect.order`; `total` the last.
 * - `bigwin` = total x multiplier; `bigwin:from` = bigwin x bigWin.fromRatio (count-up start).
 * - `balance:afterBet` = the configured "balance after the spin" (reference 0.00);
 *   `balance:final` = balance after the spin + bigwin (reference 7,800.00).
 *   Note: the reference shows 0.00 after the bet and 7,800.00 at the end (as if the start
 *   balance were the bet); the formula gives 9.80 / 7,809.80 with the defaults.
 */
export function resolveValues(script: CodeScript, overrides: Record<string, number> = {}): Record<string, number> {
  const v: Record<string, number> = {};
  for (const d of script.values) {
    const o = overrides[d.key];
    v[d.key] = typeof o === 'number' && Number.isFinite(o) ? o : d.default;
  }
  const num = (k: string): number => v[k] ?? 0;

  const w = script.whirl;
  let run = 0;
  const sums = w.collect.map((c) => (run += num(c.value)));
  const final = num(w.value);
  sums.forEach((s, i) => {
    v[`whirl:step${i}`] = cents(run > 0 ? (final * s) / run : (final * (i + 1)) / sums.length);
  });

  let total = 0;
  script.collect.order.forEach((c, i) => {
    total += num(c.value);
    v[`total:step${i}`] = cents(total);
  });
  v.total = cents(total);
  v.bigwin = cents(total * num('multiplier'));
  v['bigwin:from'] = cents(v.bigwin * script.bigWin.fromRatio);
  v['balance:afterBet'] = cents(num('balance:afterSpin'));
  v['balance:final'] = cents(v['balance:afterBet'] + v.bigwin);
  return v;
}
