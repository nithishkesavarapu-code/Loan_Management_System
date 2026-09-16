export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function indiaDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === name)!.value;
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}

export function completedAge(dob: string, today: string): number {
  if (!isDateOnly(dob) || !isDateOnly(today) || dob > today) throw new RangeError('Invalid date of birth or evaluation date.');
  const year = Number(today.slice(0, 4));
  let birthday = dob.slice(5);
  if (birthday === '02-29' && !isDateOnly(`${today.slice(0, 4)}-02-29`)) birthday = '03-01';
  return year - Number(dob.slice(0, 4)) - (today.slice(5) < birthday ? 1 : 0);
}
