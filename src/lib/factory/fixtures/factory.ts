/* The factory `GET /v1/factory` describes: its FACTORY.json name and its stages. */
import type { components } from '$lib/factory/generated/factory-api';

export const factory = {
	factoryId: 'factory-geut-01',
	name: 'Chan',
	stages: [
		{ enabled: true, name: 'plan', optional: false, perTask: false },
		{ enabled: true, name: 'work', optional: false, perTask: true },
		{ enabled: false, name: 'qa', optional: true, perTask: true },
		{ enabled: true, name: 'review', optional: false, perTask: false },
		{ enabled: true, name: 'wrapup', optional: false, perTask: false }
	]
} satisfies components['schemas']['Factory'];
