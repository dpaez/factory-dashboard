/**
 * DESIGN.md → Workflow Stage Cards: a count flashes Beacon Yellow for 300ms
 * when its value changes. Never on first render, never under
 * `prefers-reduced-motion: reduce`; the pending timer is cleared on change
 * and on destroy. Create it during component initialisation.
 */
import { untrack } from 'svelte';

export const COUNT_FLASH_MS = 300;

function prefersReducedMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class CountFlash {
	/** True for `COUNT_FLASH_MS` after the value changes. */
	active = $state(false);

	constructor(value: () => unknown) {
		let previous = untrack(value);
		$effect(() => {
			const current = value();
			if (Object.is(current, previous)) return;
			previous = current;
			if (prefersReducedMotion()) return;
			untrack(() => (this.active = true));
			const timer = setTimeout(() => (this.active = false), COUNT_FLASH_MS);
			return () => {
				clearTimeout(timer);
				this.active = false;
			};
		});
	}
}
