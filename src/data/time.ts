import type { DemandProfile, TimeSlot } from '../types';

export const SLOT_MINUTES = 15;
export const SERVICE_START_MIN = 5 * 60; // 05:00
export const SERVICE_END_MIN = 25 * 60; // 01:00 (next day)

const pad = (n: number) => String(n).padStart(2, '0');
export const minToLabel = (m: number): string => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

export const SLOTS: TimeSlot[] = Array.from(
  { length: (SERVICE_END_MIN - SERVICE_START_MIN) / SLOT_MINUTES },
  (_, index) => {
    const startMin = SERVICE_START_MIN + index * SLOT_MINUTES;
    return { index, startMin, label: minToLabel(startMin) };
  },
);

export const slotIndexAt = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  let min = h * 60 + m;
  if (min < SERVICE_START_MIN) min += 24 * 60;
  return Math.floor((min - SERVICE_START_MIN) / SLOT_MINUTES);
};

const gauss = (t: number, mu: number, sigma: number) => Math.exp(-((t - mu) ** 2) / (2 * sigma ** 2));

/**
 * Typical weekday demand profile (synthetic): morning peak 08:00, evening peak 16:45,
 * a midday plateau and low demand early and late. Replaced by the measured profile once gate data is available.
 */
export function buildWeekdayProfile(): DemandProfile {
  const raw = SLOTS.map((s) => {
    const t = s.startMin + SLOT_MINUTES / 2;
    let w = 0.12 + 1.0 * gauss(t, 8 * 60, 45) + 0.85 * gauss(t, 16 * 60 + 45, 60) + 0.25 * gauss(t, 12 * 60 + 30, 120);
    if (t < 6 * 60) w *= 0.3;
    if (t > 23 * 60) w *= 0.4;
    return w;
  });
  const total = raw.reduce((a, b) => a + b, 0);
  return {
    slotMinutes: SLOT_MINUTES,
    slots: SLOTS,
    shares: raw.map((w) => w / total),
    src: {
      kind: 'synthetic',
      ref: 'synthetic',
      note: 'Double-peaked weekday curve. Temporary assumption in place of a measured hourly profile.',
    },
  };
}
