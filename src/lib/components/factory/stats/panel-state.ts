/**
 * What a stats panel shows: a skeleton while its read is in flight, a safe
 * failure (`{title, retryable}`, never upstream detail) when the read failed,
 * or its view model. A failed read blanks only its own panel.
 */
export type PanelFailure = { title: string; retryable: boolean };

export type PanelState<T> =
	{ kind: 'loading' } | ({ kind: 'error' } & PanelFailure) | { kind: 'ready'; model: T };

export const loadingPanel = { kind: 'loading' } as const satisfies PanelState<never>;

export function readyPanel<T>(model: T): PanelState<T> {
	return { kind: 'ready', model };
}

export function failedPanel<T>(failure: PanelFailure): PanelState<T> {
	return { kind: 'error', title: failure.title, retryable: failure.retryable };
}
