import { env } from '../config/env';
import { logger } from '../utils/logger';

// ─── Cal.com API wrapper ───────────────────────────────────
// Thin client over the Cal.com v2 API. Used by:
//   • the deadline backstop (cancel a booking made after a job's deadline)
//   • per-job availability (cap the bookable window to the job's deadline)
//
// All calls are best-effort: if CAL_API_KEY is unset we log and no-op so the
// invite/booking loop still functions (the webhook backstop independently
// guarantees no late call is ever scheduled).

const CAL_API_BASE = 'https://api.cal.com/v2';

function calHeaders(apiVersion?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${env.CAL_API_KEY}`,
    'Content-Type': 'application/json',
    'cal-api-version': apiVersion || env.CAL_API_VERSION,
  };
}

/**
 * Cancel a Cal.com booking by its uid. Returns true on success.
 * No-ops (returns false) when CAL_API_KEY is not configured.
 */
export async function cancelBooking(bookingUid: string, reason: string): Promise<boolean> {
  if (!env.CAL_API_KEY) {
    logger.warn(`cancelBooking(${bookingUid}) skipped — CAL_API_KEY not configured`);
    return false;
  }

  try {
    const resp = await fetch(`${CAL_API_BASE}/bookings/${encodeURIComponent(bookingUid)}/cancel`, {
      method: 'POST',
      headers: calHeaders('2024-08-13'),
      body: JSON.stringify({ cancellationReason: reason }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      logger.error(`Cal.com cancelBooking(${bookingUid}) failed (${resp.status}): ${detail.slice(0, 400)}`);
      return false;
    }

    logger.info(`Cal.com booking ${bookingUid} cancelled (${reason})`);
    return true;
  } catch (err) {
    logger.error(`Cal.com cancelBooking(${bookingUid}) error:`, err);
    return false;
  }
}

/**
 * Cap the bookable window of the configured event type so candidates cannot
 * pick a slot after `deadline`. Uses Cal.com's future-booking `bookingWindow`
 * with a fixed date range (today → deadline). Best-effort: returns false if
 * Cal isn't configured or the call fails.
 *
 * NOTE: this mutates a SHARED event type. It is correct only when the deadline
 * is a single per-event-type value. For true per-job windows, use a per-job
 * managed event type and pass its id (left as a follow-up — see WS5 notes).
 */
export async function setEventTypeBookingWindow(deadline: Date): Promise<boolean> {
  if (!env.CAL_API_KEY || !env.CAL_EVENT_TYPE_ID) {
    logger.warn('setEventTypeBookingWindow skipped — CAL_API_KEY/CAL_EVENT_TYPE_ID not configured');
    return false;
  }

  const today = new Date();
  const startStr = today.toISOString().split('T')[0];
  const endStr = deadline.toISOString().split('T')[0];

  try {
    const resp = await fetch(`${CAL_API_BASE}/event-types/${encodeURIComponent(env.CAL_EVENT_TYPE_ID)}`, {
      method: 'PATCH',
      headers: calHeaders('2024-06-14'),
      body: JSON.stringify({
        bookingWindow: {
          type: 'range',
          value: [startStr, endStr],
        },
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      logger.error(`Cal.com setEventTypeBookingWindow failed (${resp.status}): ${detail.slice(0, 400)}`);
      return false;
    }

    logger.info(`Cal.com event type ${env.CAL_EVENT_TYPE_ID} booking window set to ${startStr}..${endStr}`);
    return true;
  } catch (err) {
    logger.error('Cal.com setEventTypeBookingWindow error:', err);
    return false;
  }
}
