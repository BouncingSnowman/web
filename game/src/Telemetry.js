// src/Telemetry.js
// Lightweight fire-and-forget analytics for player behavior tracking.
// All calls are non-blocking — failures are silently swallowed.

const FUNCTIONS_BASE = 'https://cywcnyimlhiwbbqqzvoe.supabase.co/functions/v1';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5d2NueWltbGhpd2JicXF6dm9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NjIyOTYsImV4cCI6MjA4MTEzODI5Nn0.rVPlSGwbKz-HyODCz3f2tFW-9sm1X3zRVuWoDuwsM24';

// Random session ID per page load
const SESSION_ID = crypto.randomUUID ? crypto.randomUUID() :
    ('s-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

// Rate-limit: don't send more than 60 events per session
let _eventCount = 0;
const MAX_EVENTS = 60;

/**
 * Track a game event. Fire-and-forget — never blocks, never throws.
 * @param {string} event - Event name (e.g., 'death', 'game_over')
 * @param {Object} [data={}] - Optional data payload
 */
export function track(event, data = {}) {
    if (++_eventCount > MAX_EVENTS) return;

    try {
        const body = JSON.stringify({
            session_id: SESSION_ID,
            event: String(event),
            data: data || {}
        });

        fetch(`${FUNCTIONS_BASE}/clever-task`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY
            },
            body,
            keepalive: true  // Ensures the request completes even if page unloads
        }).catch(() => { });
    } catch (e) { /* silent */ }
}

export const Telemetry = { track, SESSION_ID };
