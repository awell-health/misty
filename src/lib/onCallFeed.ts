import { IcsEvent } from './ics';
import { dateInZone, zonedMidnight } from './timezone';
import { addOneDay } from './googleCalendar';
import { OnCallShift } from '../types';

// Turns incident.io schedule feed events into day-granular shifts for the
// timeline. Feed summaries read "Mike Pack on-call for Triage Captain"; the
// timeline only wants the name.
export function shiftsFromFeed(events: IcsEvent[], now = new Date()): OnCallShift[] {
  return events
    .filter((event) => event.end > now)
    .map((event) => {
      const start = nearestDayStart(event.start);
      // end is exclusive. A shift shorter than half a day still shows as one.
      const roundedEnd = nearestDayStart(event.end);
      const end = roundedEnd > start ? roundedEnd : addOneDay(start);
      const name = event.summary.replace(/\s+on-call for .*$/i, '').trim() || 'On call';
      return { name, start, end };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

// The local day boundary nearest to a handover, so the handover day goes to
// whoever holds most of it: a 6pm handover keeps that day with the outgoing
// person, a 9am one gives it to the incoming person. Both sides of a handover
// round the same instant, so consecutive shifts never overlap.
function nearestDayStart(instant: Date): string {
  const day = dateInZone(instant);
  const sinceMidnight = instant.getTime() - zonedMidnight(day).getTime();
  return sinceMidnight >= 12 * 60 * 60 * 1000 ? addOneDay(day) : day;
}

// Preferred short names, keyed by full name (lowercased, without any
// parenthetical incident.io appends, e.g. "Jonathan Belanger (Jonathan (JB))").
const ALIASES: Record<string, string> = {
  'abigaila ekiert': 'Abi',
  'jonathan belanger': 'JB',
};

// The label under each dot: the alias for this full name, else the first name.
export function shortName(fullName: string): string {
  const name = fullName.replace(/\(.*\)/, '').trim();
  return ALIASES[name.toLowerCase()] ?? name.split(/\s+/)[0] ?? '';
}
