import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
	blockers: {
		ticket: r.one.tickets({
			from: r.blockers.ticketId,
			to: r.tickets.id
		}),
	},
	tickets: {
		blockers: r.many.blockers(),
		tasks: r.many.tasks(),
		sessions: r.many.sessions(),
		usages: r.many.usage(),
	},
	tasks: {
		ticket: r.one.tickets({
			from: r.tasks.ticketId,
			to: r.tickets.id
		}),
		taskBlockedBies: r.many.taskBlockedBy(),
	},
	taskBlockedBy: {
		task: r.one.tasks({
			from: [r.taskBlockedBy.ticketId, r.taskBlockedBy.taskId],
			to: [r.tasks.ticketId, r.tasks.taskId]
		}),
	},
	sessions: {
		ticket: r.one.tickets({
			from: r.sessions.ticketId,
			to: r.tickets.id
		}),
	},
	usage: {
		ticket: r.one.tickets({
			from: r.usage.ticketId,
			to: r.tickets.id
		}),
	},
}))