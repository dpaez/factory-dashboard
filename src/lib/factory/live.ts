/**
 * The browser's view of the factory event stream. Browser-safe and pure; the
 * live controller (#22 task 03) and `connection-status.svelte` share it.
 */

/** Connecting, following live, retrying, given up, or refused by the factory. */
export type ConnectionState =
	'connecting' | 'live' | 'reconnecting' | 'disconnected' | 'auth_failed';
