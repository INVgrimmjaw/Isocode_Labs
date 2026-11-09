const IST_OFFSET = '+05:30';

const istDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar date in India, as YYYY-MM-DD, whatever timezone the server runs in. */
export function istDateKey(date: Date): string {
  return istDate.format(date);
}

export function istCompactDate(date: Date): string {
  return istDateKey(date).replaceAll('-', '');
}

/** The instants at which a calendar date in India begins and ends. */
export function istDayRange(dateKey: string): { start: Date; end: Date } {
  const start = new Date(`${dateKey}T00:00:00${IST_OFFSET}`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
