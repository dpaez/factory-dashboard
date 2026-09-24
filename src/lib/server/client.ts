import { drizzle } from 'drizzle-orm/node-sqlite';
import { DB_URL } from '$env/static/private';

import { relations } from '$lib/db/drizzle/relations';

export const db = drizzle(DB_URL, { relations });
