import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COUNT_FLASH_MS, CountFlash } from './count-flash.svelte';

function track(initial: number) {
	let value = $state(initial);
	let flash!: CountFlash;
	const destroy = $effect.root(() => {
		flash = new CountFlash(() => value);
	});
	flushSync();
	return {
		flash,
		destroy,
		set(next: number) {
			value = next;
			flushSync();
		}
	};
}

function stubReducedMotion(reduce: boolean) {
	vi.stubGlobal('matchMedia', (query: string) => ({
		matches: reduce && query.includes('prefers-reduced-motion: reduce'),
		media: query
	}));
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('CountFlash', () => {
	it('does not flash on first render', () => {
		const counter = track(3);
		expect(counter.flash.active).toBe(false);
		counter.destroy();
	});

	it('flashes for 300ms when the value changes, and not for the same value', () => {
		vi.useFakeTimers();
		stubReducedMotion(false);
		const counter = track(3);
		counter.set(3);
		expect(counter.flash.active).toBe(false);
		counter.set(4);
		expect(counter.flash.active).toBe(true);
		vi.advanceTimersByTime(COUNT_FLASH_MS - 1);
		expect(counter.flash.active).toBe(true);
		vi.advanceTimersByTime(1);
		expect(counter.flash.active).toBe(false);
		counter.destroy();
	});

	it('never flashes under prefers-reduced-motion: reduce', () => {
		stubReducedMotion(true);
		const counter = track(3);
		counter.set(4);
		expect(counter.flash.active).toBe(false);
		counter.destroy();
	});

	it('clears its timer on destroy', () => {
		vi.useFakeTimers();
		stubReducedMotion(false);
		const counter = track(1);
		counter.set(2);
		expect(vi.getTimerCount()).toBe(1);
		counter.destroy();
		expect(vi.getTimerCount()).toBe(0);
	});
});
