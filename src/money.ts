/** Region settings shared by the game numbers, the notification and the page. */
export interface Region {
  /** BCP 47 locale, e.g. 'en-AU', 'de-DE', 'uk-UA'. */
  locale: string;
  /** ISO 4217 code, e.g. 'AUD', 'EUR', 'UAH'. */
  currency: string;
}

/** Locales offered in Studio (country → number format). */
export const LOCALES: { id: string; label: string }[] = [
  { id: 'en-AU', label: 'Australia' },
  { id: 'en-CA', label: 'Canada (English)' },
  { id: 'fr-CA', label: 'Canada (French)' },
  { id: 'en-US', label: 'United States' },
  { id: 'en-GB', label: 'United Kingdom' },
  { id: 'en-NZ', label: 'New Zealand' },
  { id: 'de-DE', label: 'Germany' },
  { id: 'fr-FR', label: 'France' },
  { id: 'es-ES', label: 'Spain' },
  { id: 'it-IT', label: 'Italy' },
  { id: 'pt-BR', label: 'Brazil' },
  { id: 'pl-PL', label: 'Poland' },
  { id: 'uk-UA', label: 'Ukraine' },
  { id: 'ja-JP', label: 'Japan' },
];

export const CURRENCIES = ['AUD', 'CAD', 'USD', 'GBP', 'NZD', 'EUR', 'BRL', 'PLN', 'UAH', 'JPY'];

/** Group and decimal separators and fraction digits used in that region. */
export function separatorsFor(r: Region): { thousands: string; decimal: string; decimals: number } {
  const nf = new Intl.NumberFormat(r.locale, { style: 'currency', currency: r.currency });
  const parts = nf.formatToParts(12345.6);
  const thousands = parts.find((p) => p.type === 'group')?.value ?? ',';
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
  return { thousands, decimal, decimals: nf.resolvedOptions().maximumFractionDigits ?? 2 };
}

/** Full money string with the currency sign, as written in that region ("$7,800.00", "7.800,00 €"). */
export function formatCurrency(value: number, r: Region): string {
  return new Intl.NumberFormat(r.locale, { style: 'currency', currency: r.currency }).format(value);
}

/** Currency sign alone ("$", "€", "₴"). */
export function currencySymbol(r: Region): string {
  const parts = new Intl.NumberFormat(r.locale, { style: 'currency', currency: r.currency }).formatToParts(1);
  return parts.find((p) => p.type === 'currency')?.value ?? r.currency;
}

/** Replace {win}, {balance}, {start}, {id}, {currency} in a template. */
export function fillTemplate(tpl: string, v: { win: number; balance: number; start: number; id: string }, r: Region): string {
  return tpl
    .replace(/\{win\}/g, formatCurrency(v.win, r))
    .replace(/\{balance\}/g, formatCurrency(v.balance, r))
    .replace(/\{start\}/g, formatCurrency(v.start, r))
    .replace(/\{id\}/g, v.id)
    .replace(/\{currency\}/g, currencySymbol(r));
}

/** New random 4-digit number for each take. */
export function randomId(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}
