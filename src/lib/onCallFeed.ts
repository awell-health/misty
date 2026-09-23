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
      const start = dateInZone(event.start);
      // end is exclusive: a shift handing over at 9am still covers that day,
      // so only a handover at exactly local midnight ends on the prior day.
      const endDay = dateInZone(event.end);
      const end = zonedMidnight(endDay).getTime() === event.end.getTime() ? endDay : addOneDay(endDay);
      const name = event.summary.replace(/\s+on-call for .*$/i, '').trim() || 'On call';
      return { name, start, end };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}
