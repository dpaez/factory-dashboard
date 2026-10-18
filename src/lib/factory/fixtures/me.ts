/* The API client behind the token, with and without an operator. */
import type { components } from '$lib/factory/generated/factory-api';

export const meWithOperator = {
	name: 'dashboard',
	onBehalfOf: 'Diego'
} satisfies components['schemas']['Me'];

export const meWithoutOperator = {
	name: 'dashboard',
	onBehalfOf: null
} satisfies components['schemas']['Me'];
