// Minimal iCalendar (RFC 5545) reader for the incident.io schedule feed.
// Handles only what that feed emits: VEVENTs with UTC or all-day
// DTSTART/DTEND, a SUMMARY and ATTENDEE mailto: lines.

export interface IcsEvent {
  summary: string;
  start: Date;
  end: Date;
  attendees: string[]; // email addresses
}

export function parseIcs(text: string): IcsEvent[] {
  // Unfold continuation lines (a line starting with a space or tab continues
  // the previous one), then walk the VEVENT blocks.
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');

  const events: IcsEvent[] = [];
  let current: Partial<IcsEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = { attendees: [] };
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current?.start && current.end) {
        events.push({
          summary: current.summary ?? '',
          start: current.start,
          end: current.end,
          attendees: current.attendees ?? [],
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1);

    if (name === 'SUMMARY') current.summary = unescapeText(value);
    else if (name === 'DTSTART') current.start = parseIcsDate(value);
    else if (name === 'DTEND') current.end = parseIcsDate(value);
    else if (name === 'ATTENDEE' && value.toLowerCase().startsWith('mailto:')) {
      current.attendees!.push(value.slice(7));
    }
  }

  return events;
}

// "20260921T173500Z" (UTC) or "20260921" (all-day, taken as UTC midnight).
function parseIcsDate(value: string): Date | undefined {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!m) return undefined;
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}
