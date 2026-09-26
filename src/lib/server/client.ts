import { drizzle } from 'drizzle-orm/node-sqlite';
import { env } from '$env/dynamic/private';

import { relations } from '$lib/db/drizzle/relations';

const url = env.DB_URL;
if (!url) throw new Error('DB_URL is required');

export const db = drizzle(url, { relations });
