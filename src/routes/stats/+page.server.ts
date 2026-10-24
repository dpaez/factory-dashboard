import { TICKETS_KEY } from '$lib/factory/events';
import {
	parseCohortWindow,
	toCohort,
	toStageTable,
	toSummaryMetrics,
	toTokensByStage,
	type Cohort,
	type StatsStages,
	type StatsSummary,
	type StageGroup,
	type SummaryMetrics,
	type TokensByStage
} from '$lib/factory/stats';
import { factoryClientFromEnv, type FactoryClient } from '$lib/server/factory/client';
import { isConfigurationFailure, throwPageError } from '$lib/server/factory/pages';
import { getStatsStages, getStatsSummary, type FactoryResult } from '$lib/server/factory/reads';
import type { PageServerLoad } from './$types';

/** One panel's data: its model, or a safe failure with no upstream detail or body. */
export type StatsPanelResult<T> =
	{ ok: true; model: T } | { ok: false; failure: { title: string; retryable: boolean } };

/**
 * A read as a panel result. Auth and configuration failures are the
 * page-level configuration error, not a panel error.
 */
function settle<T>(result: FactoryResult<T>): StatsPanelResult<T> {
	if (result.ok) return { ok: true, model: result.data };
	// The upstream Problem detail never reaches the page, not even on the configuration error.
	if (isConfigurationFailure(result.failure)) {
		const { status, type, title, retryable } = result.failure;
		throwPageError({ status, type, title, retryable });
	}
	const { title, retryable } = result.failure;
	return { ok: false, failure: { title, retryable } };
}

function mapPanel<T, M>(result: StatsPanelResult<T>, toModel: (data: T) => M): StatsPanelResult<M> {
	return result.ok ? { ok: true, model: toModel(result.model) } : result;
}

/**
 * Tokens by stage. Coverage divides stage tokens by summary tokens, so it is
 * Unavailable when the two reads came from different factories or definitions.
 */
function tokensByStage(
	stages: StatsStages,
	summary: StatsSummary | null,
	cohort: Cohort
): TokensByStage {
	if (!cohort.mismatch) return toTokensByStage(stages, summary, cohort);
	const model = toTokensByStage(stages, null, cohort);
	return {
		...model,
		coverage: { ...model.coverage, unavailableReason: MISMATCH_REASON }
	};
}

const MISMATCH_REASON =
	'The summary and stages came from different factories or definitions, so they do not compare.';

/**
 * Factory stats for one cohort. The window is computed once from the URL and
 * every read gets the identical `from`/`to`, so every panel describes the same
 * tickets. A failed read blanks only its own panels.
 */
export const load: PageServerLoad = async ({ depends, fetch, url }) => {
	// Ticket events change open-ticket figures; the live controller reruns this load.
	depends(TICKETS_KEY);
	let client: FactoryClient;
	try {
		client = factoryClientFromEnv(fetch);
	} catch (cause) {
		throwPageError(cause);
	}

	const window = parseCohortWindow(url.searchParams);
	const { from, to } = window;
	const [summaryRead, stagesRead] = await Promise.all([
		getStatsSummary(client, { from, to }),
		getStatsStages(client, { from, to, groupBy: 'setup' })
	]);
	const observedAt = new Date().toISOString();
	const summary = settle(summaryRead);
	const stages = settle(stagesRead);

	const summaryData = summary.ok ? summary.model : null;
	const stagesData = stages.ok ? stages.model : null;

	const cohort: Cohort = toCohort([summaryData, stagesData], window, observedAt);
	return {
		cohort,
		notice: window.notice,
		summary: mapPanel(summary, (data): SummaryMetrics => toSummaryMetrics(data, cohort)),
		stages: mapPanel(stages, (data): StageGroup[] => toStageTable(data, cohort)),
		// The token bars need the stages; their coverage needs the summary of the same envelope.
		tokens: mapPanel(stages, (data): TokensByStage => tokensByStage(data, summaryData, cohort))
	};
};
