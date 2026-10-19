// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		/**
		 * The safe page error body. It reaches the browser, so it never carries
		 * the factory token, the factory URL or an upstream response body.
		 */
		interface Error {
			message: string;
			/** Which explanation `+error.svelte` shows. */
			kind: 'configuration' | 'not_found' | 'unavailable' | 'invalid';
			/** A scrubbed, human-readable detail. */
			detail?: string;
		}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
