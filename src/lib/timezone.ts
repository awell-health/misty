// The team's calendars (and the incident.io schedules) are in Denver time, so
// day boundaries are computed there rather than in the server's UTC.
export const TEAM_TIMEZONE = 'America/Denver';

// "YYYY-MM-DD" for the calendar day `date` falls on in `timeZone`.
export function dateInZone(date: Date, timeZone = TEAM_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// The instant local midnight starts on `dateStr` ("YYYY-MM-DD") in `timeZone`.
export function zonedMidnight(dateStr: string, timeZone = TEAM_TIMEZONE): Date {
  const utcMidnight = new Date(dateStr + 'T00:00:00Z');
  // Offset of the zone from UTC at that moment, e.g. -6h for MDT. Doing the
  // lookup at the adjusted instant corrects for a DST change between the two.
  const offset = (at: Date) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(at).map((p) => [p.type, p.value])
    );
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return asUtc - at.getTime();
  };
  const guess = new Date(utcMidnight.getTime() - offset(utcMidnight));
  return new Date(utcMidnight.getTime() - offset(guess));
}
