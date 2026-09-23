import { describe, it, expect } from 'vitest';
import { parseIcs } from './ics';
import { shiftsFromFeed } from './onCallFeed';
import { dateInZone, zonedMidnight } from './timezone';

// Trimmed from the real incident.io Triage Captain feed, including its
// folded DESCRIPTION line and CRLF line endings.
const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'X-WR-CALNAME:On-call feed for Triage Captain',
  'BEGIN:VEVENT',
  'UID:01M3591TZZ0AY616771CCZN2KM-1',
  'SUMMARY:Mike Pack on-call for Triage Captain',
  "DESCRIPTION:Mike Pack is on-call for <a",
  "  href='https://app.incident.io/on-call/schedules/01M32GTH9ATJQ8X96K4C2BWYW",
  " G'>Triage Captain</a>.",
  'DTSTART:20260921T173500Z',
  'DTEND:20261005T150000Z',
  'ATTENDEE:mailto:mike@awellhealth.com',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:Thomas on-call for Triage Captain',
  'DTSTART:20261005T150000Z',
  'DTEND:20261012T060000Z',
  'ATTENDEE:mailto:thomas@awellhealth.com',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseIcs', () => {
  it('reads summary, UTC times and attendees from each VEVENT', () => {
    const [first] = parseIcs(FEED);
    expect(first.summary).toBe('Mike Pack on-call for Triage Captain');
    expect(first.start.toISOString()).toBe('2026-09-21T17:35:00.000Z');
    expect(first.end.toISOString()).toBe('2026-10-05T15:00:00.000Z');
    expect(first.attendees).toEqual(['mike@awellhealth.com']);
  });

  it('skips events without both start and end', () => {
    const text = 'BEGIN:VEVENT\nSUMMARY:broken\nDTSTART:20260101T000000Z\nEND:VEVENT';
    expect(parseIcs(text)).toEqual([]);
  });
});

describe('timezone helpers', () => {
  it('finds local midnight in Denver across the DST change', () => {
    expect(zonedMidnight('2026-10-01').toISOString()).toBe('2026-10-01T06:00:00.000Z'); // MDT
    expect(zonedMidnight('2026-12-01').toISOString()).toBe('2026-12-01T07:00:00.000Z'); // MST
  });

  it('reports the Denver calendar day, not the UTC one', () => {
    expect(dateInZone(new Date('2026-10-02T03:00:00Z'))).toBe('2026-10-01');
  });
});

describe('shiftsFromFeed', () => {
  const now = new Date('2026-09-23T12:00:00Z');

  it('strips the "on-call for" suffix and uses Denver days', () => {
    expect(shiftsFromFeed(parseIcs(FEED), now)).toEqual([
      // Hands over at 9am on Oct 5, so Oct 5 is still covered (end exclusive).
      { name: 'Mike Pack', start: '2026-09-21', end: '2026-10-06' },
      // Ends at local midnight starting Oct 12, so Oct 11 is the last day.
      { name: 'Thomas', start: '2026-10-05', end: '2026-10-12' },
    ]);
  });

  it('drops shifts that already ended', () => {
    const later = new Date('2026-10-06T00:00:00Z');
    expect(shiftsFromFeed(parseIcs(FEED), later).map((s) => s.name)).toEqual(['Thomas']);
  });
});
