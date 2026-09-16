export function rupeesToPaise(value: string): number {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) throw new RangeError('Enter a nonnegative amount with at most 2 decimal places.');
  const [rupees, fraction = ''] = trimmed.split('.');
  const paise = BigInt(rupees!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('The amount is too large.');
  return Number(paise);
}

export function paiseToRupees(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid paise amount.');
  const paise = BigInt(value);
  return `${paise / 100n}.${String(paise % 100n).padStart(2, '0')}`;
}
export function formatINR(paise: number): string {
  const [whole, fraction] = paiseToRupees(paise).split('.');
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', currencyDisplay: 'code' })
    .formatToParts(BigInt(whole!)).map((part) => part.type === 'fraction' ? fraction! : part.value).join('');
}
