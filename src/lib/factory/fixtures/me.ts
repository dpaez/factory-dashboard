/* The API client behind the token, with and without an operator. */
import type { components } from '$lib/factory/generated/factory-api';

export const meWithOperator = {
	name: 'dashboard',
	onBehalfOf: 'Diego',
	scope: 'act'
} satisfies components['schemas']['Me'];

export const meWithoutOperator = {
	name: 'dashboard',
	onBehalfOf: null,
	scope: 'act'
} satisfies components['schemas']['Me'];
