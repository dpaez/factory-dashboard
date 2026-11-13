<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
	import FeedbackRoundsBox, { type FeedbackRoundsPending } from './feedback-rounds-box.svelte';
	import { EXPLANATIONS } from '$lib/factory/commands.svelte';
	import type { CommandPhase } from '$lib/factory/commands';
	import type { PendingFeedback } from '$lib/factory/feedback';
	import { FEEDBACK_COPY, allRefs, type FeedbackChoice } from '$lib/factory/feedback-rounds';
	import { ACTION_REASONS, type ActionAvailability } from '$lib/factory/ticket-actions';
	import {
		pendingFeedback,
		pendingFeedbackMany,
		pendingFeedbackNone,
		pendingFeedbackNoUrl,
		pendingFeedbackSkippedTruncated,
		problemCodeHostUnavailable,
		ticketDetailReadyForHandoffAfterRound,
		ticketDetailTwoFeedbackRounds
	} from '$lib/factory/fixtures';
	import { earlierRounds, toTasks } from '$lib/factory/adapters';
	import type { EarlierRoundView } from '$lib/factory/models';

	const twoRounds = earlierRounds(toTasks(ticketDetailTwoFeedbackRounds.tasks));
	const oneRound = earlierRounds(toTasks(ticketDetailReadyForHandoffAfterRound.tasks));

	// Stories render twice (light and dark panes); queries use the first pane.
	const firstPane = (canvasElement: HTMLElement) =>
		(canvasElement.querySelector('[data-theme-pane]') as HTMLElement | null) ?? canvasElement;

	const ENABLED = { kind: 'enabled' } as const;
	const disabled = (reason: string) => ({ kind: 'disabled', reason }) as const;

	const ready = (value: PendingFeedback): FeedbackRoundsPending => ({
		status: 'ready',
		candidates: value.candidates,
		skipped: value.skipped,
		truncated: value.truncated,
		failure: null,
		reading: false
	});

	type Options = {
		availability?: Exclude<ActionAvailability, { kind: 'hidden' }>;
		pending?: FeedbackRoundsPending | null;
		ticked?: string[];
		note?: string;
		phase?: CommandPhase;
		explanation?: string;
		rounds?: EarlierRoundView[];
	};

	const build = (options: Options = {}) => {
		const pending = options.pending === undefined ? ready(pendingFeedback) : options.pending;
		return {
			availability: options.availability ?? ENABLED,
			pending,
			ticked: options.ticked ?? (pending?.status === 'ready' ? allRefs(pending.candidates) : []),
			note: options.note ?? '',
			phase: options.phase ?? 'idle',
			explanation: options.explanation,
			rounds: options.rounds ?? [],
			onstart: fn<(choice: FeedbackChoice) => void>(),
			onrefresh: fn<() => void>()
		};
	};

	const start = (pane: HTMLElement) => within(pane).getByTestId('feedback-start');
	const noteField = (pane: HTMLElement) =>
		within(pane).getByRole('textbox', { name: FEEDBACK_COPY.noteLabel });
	const rows = (pane: HTMLElement) => pane.querySelectorAll('[data-ref]');
	const boxes = (pane: HTMLElement) =>
		within(pane).queryAllByRole('checkbox') as HTMLInputElement[];
	const position = (pane: HTMLElement) => within(pane).getByTestId('feedback-position');
	const button = (pane: HTMLElement, name: string) => within(pane).getByRole('button', { name });

	const NO_NEW_FEEDBACK =
		'No new feedback on https://github.com/dpaez/factory-dashboard/pull/42 since the last push (2 skipped: outdated). Add a note to start a round anyway.';

	const { Story } = defineMeta({
		title: 'Components/Factory/FeedbackRoundsBox',
		component: FeedbackRoundsBox,
		parameters: {
			a11y: { test: 'error' },
			docs: {
				description: {
					component:
						"The Inspector's Feedback rounds box, in place of the action bar's Feedback round. It lists the pull request's pending comments 5 per page, every row ticked to start; select all and select none apply to every page. **Start round with N comments** emits `onstart` with no `only` when every row is ticked, the ticked refs otherwise, and the note when one is typed. With nothing pending, a note alone starts a round. Presentational: the owner reads the list (`PendingFeedbackState`), decides availability (`feedbackRoundAvailability`) and sends the round. With `pending` null (not at handoff, or a merged or closed pull request) only the reason shows."
				}
			}
		}
	});
</script>

<Story
	name="Loading"
	args={build({ pending: { ...ready(pendingFeedbackNone), status: 'loading', reading: true } })}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByRole('status')).toHaveTextContent(FEEDBACK_COPY.loading);
		await expect(start(pane)).toBeDisabled();
		await expect(start(pane)).toHaveTextContent('Start round');
		await expect(button(pane, 'Refresh')).toBeDisabled();
		await userEvent.click(start(pane), { pointerEventsCheck: 0 });
		await expect(args.onstart).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Pending (3)"
	args={build()}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(rows(pane)).toHaveLength(3);
		for (const box of boxes(pane)) await expect(box).toBeChecked();
		await expect(start(pane)).toHaveTextContent('Start round with 3 comments');
		const [thread, review, comment] = pendingFeedback.candidates;
		const first = pane.querySelector<HTMLElement>(`[data-ref="${thread!.ref}"]`)!;
		await expect(first).toHaveTextContent('Review thread');
		await expect(first).toHaveTextContent(thread!.author);
		await expect(first).toHaveTextContent(thread!.location!);
		await expect(first).toHaveTextContent(thread!.summary);
		await expect(first).toHaveTextContent(thread!.ref);
		// The ref is the link to the comment on GitHub, in a new tab, apart from the checkbox.
		const link = within(first).getByRole('link', { name: `Open ${thread!.ref} on GitHub` });
		await expect(link).toHaveAttribute('href', thread!.url!);
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
		await expect(link).toHaveTextContent(thread!.ref);
		await expect(link.closest('label')).toBeNull();
		for (const candidate of pendingFeedback.candidates) {
			const row = pane.querySelector<HTMLElement>(`[data-ref="${candidate.ref}"]`)!;
			await expect(within(row).getByRole('link')).toHaveAttribute('href', candidate.url!);
		}
		await expect(
			within(first).getByRole('checkbox', { name: new RegExp(thread!.author) })
		).toBeChecked();
		// Only a thread has a location.
		await expect(
			pane.querySelector(`[data-ref="${review!.ref}"] [data-testid="location"]`)
		).toBeNull();
		await expect(position(pane)).toHaveTextContent('1–3 of 3');

		// Every row ticked posts no `only`.
		await userEvent.click(start(pane));
		await expect(args.onstart).toHaveBeenLastCalledWith({});

		// Some unticked posts exactly the ticked refs, and the note.
		await userEvent.click(boxes(pane)[1]!);
		await waitFor(() => expect(start(pane)).toHaveTextContent('Start round with 2 comments'));
		await userEvent.type(noteField(pane), ' Also the README. ');
		await userEvent.click(start(pane));
		await expect(args.onstart).toHaveBeenLastCalledWith({
			only: [thread!.ref, comment!.ref],
			note: 'Also the README.'
		});

		// Nothing ticked and no note: nothing to start.
		await userEvent.clear(noteField(pane));
		await userEvent.click(button(pane, 'Select none'));
		await waitFor(() => expect(start(pane)).toBeDisabled());
		await expect(start(pane)).toHaveTextContent('Start round with 0 comments');
		await expect(pane).toHaveTextContent(FEEDBACK_COPY.tickOne);
		await userEvent.click(start(pane), { pointerEventsCheck: 0 });
		await expect(args.onstart).toHaveBeenCalledTimes(2);

		await userEvent.click(button(pane, 'Select all'));
		await waitFor(() => expect(start(pane)).toHaveTextContent('Start round with 3 comments'));

		await userEvent.click(button(pane, 'Refresh'));
		await expect(args.onrefresh).toHaveBeenCalledOnce();
	}}
/>

<Story
	name="Comment without a link"
	args={build({ pending: ready(pendingFeedbackNoUrl) })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const [thread, review] = pendingFeedbackNoUrl.candidates;
		// A null `url` shows the ref as plain text, never an empty link.
		const plain = pane.querySelector<HTMLElement>(`[data-ref="${review!.ref}"]`)!;
		await expect(within(plain).queryByRole('link')).toBeNull();
		await expect(within(plain).getByTestId('ref')).toHaveTextContent(review!.ref);
		const linked = pane.querySelector<HTMLElement>(`[data-ref="${thread!.ref}"]`)!;
		await expect(within(linked).getByRole('link')).toHaveAttribute('href', thread!.url!);
		// The checkbox still controls the selection.
		await expect(within(plain).getByRole('checkbox')).toBeChecked();
		await userEvent.click(within(plain).getByRole('checkbox'));
		await waitFor(() => expect(start(pane)).toHaveTextContent('Start round with 2 comments'));
	}}
/>

<Story
	name="Many (30, paginated)"
	args={build({ pending: ready(pendingFeedbackMany) })}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const list = within(pane).getByTestId('pending-feedback-list');
		await expect(rows(pane)).toHaveLength(5);
		await expect(position(pane)).toHaveTextContent('1–5 of 30');
		await expect(button(pane, 'Previous')).toBeDisabled();
		await expect(start(pane)).toHaveTextContent('Start round with 30 comments');
		const height = list.getBoundingClientRect().height;

		// Untick one on page 1, move to page 2, untick one there.
		await userEvent.click(boxes(pane)[0]!);
		await userEvent.click(button(pane, 'Next'));
		await waitFor(() => expect(position(pane)).toHaveTextContent('6–10 of 30'));
		await expect(list.getBoundingClientRect().height).toBe(height);
		await userEvent.click(boxes(pane)[2]!);
		await waitFor(() => expect(start(pane)).toHaveTextContent('Start round with 28 comments'));

		// Back to page 1: the tick is kept.
		await userEvent.click(button(pane, 'Previous'));
		await waitFor(() => expect(position(pane)).toHaveTextContent('1–5 of 30'));
		await expect(boxes(pane)[0]).not.toBeChecked();

		for (let page = 1; page < 6; page++) await userEvent.click(button(pane, 'Next'));
		await waitFor(() => expect(position(pane)).toHaveTextContent('26–30 of 30'));
		await expect(button(pane, 'Next')).toBeDisabled();
		await expect(list.getBoundingClientRect().height).toBe(height);

		const refs = pendingFeedbackMany.candidates.map((c) => c.ref);
		await userEvent.click(start(pane));
		await expect(args.onstart).toHaveBeenLastCalledWith({
			only: refs.filter((_, index) => index !== 0 && index !== 7)
		});

		// Select none and select all cover every page.
		await userEvent.click(button(pane, 'Select none'));
		await waitFor(() => expect(start(pane)).toHaveTextContent('Start round with 0 comments'));
		await userEvent.click(button(pane, 'Select all'));
		await waitFor(() => expect(start(pane)).toHaveTextContent('Start round with 30 comments'));
		await userEvent.click(start(pane));
		await expect(args.onstart).toHaveBeenLastCalledWith({});
	}}
/>

<Story
	name="Nothing pending"
	args={build({ pending: ready(pendingFeedbackNone) })}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByTestId('nothing-pending')).toHaveTextContent(
			FEEDBACK_COPY.nothingPending
		);
		await expect(boxes(pane)).toHaveLength(0);
		await expect(start(pane)).toHaveTextContent(FEEDBACK_COPY.startNote);
		await expect(start(pane)).toBeDisabled();
		await userEvent.type(noteField(pane), 'Rename the flag.');
		await waitFor(() => expect(start(pane)).toBeEnabled());
		await userEvent.click(start(pane));
		await expect(args.onstart).toHaveBeenCalledWith({ note: 'Rename the flag.' });
	}}
/>

<Story
	name="Skipped and truncated"
	args={build({ pending: ready(pendingFeedbackSkippedTruncated) })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByTestId('feedback-skipped')).toHaveTextContent(
			'2 skipped: drive-by-user, someone-else (not collaborators or codeHost.feedback.authors) · only the newest 100 of each list were read'
		);
		await expect(rows(pane)).toHaveLength(3);
	}}
/>

<Story
	name="Read failure"
	args={build({
		pending: {
			...ready(pendingFeedbackNone),
			status: 'failed',
			failure: {
				type: problemCodeHostUnavailable.type,
				title: problemCodeHostUnavailable.title,
				detail: problemCodeHostUnavailable.detail,
				retryable: true
			}
		}
	})}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		const failure = within(pane).getByTestId('pending-feedback-failure');
		await expect(within(failure).getByRole('alert')).toHaveTextContent(
			problemCodeHostUnavailable.detail!
		);
		await expect(failure).not.toHaveTextContent(/Bearer|\/v1\//);
		await expect(start(pane)).toBeDisabled();
		await userEvent.click(within(failure).getByRole('button', { name: 'Retry' }));
		await expect(args.onrefresh).toHaveBeenCalledOnce();
	}}
/>

<Story
	name="Read-only"
	args={build({ availability: disabled(ACTION_REASONS.readOnly) })}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(rows(pane)).toHaveLength(3);
		for (const box of boxes(pane)) await expect(box).toBeDisabled();
		await expect(noteField(pane)).toBeDisabled();
		await expect(start(pane)).toBeDisabled();
		const reason = pane.querySelector<HTMLElement>('[data-reason="feedback"]')!;
		await expect(reason).toHaveTextContent(ACTION_REASONS.readOnly);
		await expect(start(pane).getAttribute('aria-describedby')).toContain(reason.id);
		await expect(button(pane, 'Refresh')).toBeEnabled();
		await userEvent.click(start(pane), { pointerEventsCheck: 0 });
		await expect(args.onstart).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Submitting"
	args={build({
		availability: disabled(ACTION_REASONS.sending),
		phase: 'submitting',
		explanation: EXPLANATIONS.submitting
	})}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(start(pane)).toBeDisabled();
		await expect(pane.querySelector('[data-reason="feedback"]')).toHaveTextContent('Sending…');
		await userEvent.click(start(pane), { pointerEventsCheck: 0 });
		await expect(args.onstart).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Accepted"
	args={build({
		availability: disabled(ACTION_REASONS.accepted),
		phase: 'accepted',
		explanation: EXPLANATIONS.accepted
	})}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(start(pane)).toBeDisabled();
		await expect(pane.querySelector('[data-reason="feedback"]')).toHaveTextContent(
			ACTION_REASONS.accepted
		);
	}}
/>

<Story
	name="Refused"
	args={build({
		phase: 'rejected',
		explanation: NO_NEW_FEEDBACK,
		ticked: [pendingFeedback.candidates[0]!.ref],
		note: 'Address the naming comments.'
	})}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const failure = pane.querySelector<HTMLElement>('[data-failure="feedback"]')!;
		await expect(failure).toHaveTextContent(NO_NEW_FEEDBACK);
		await expect(failure).not.toHaveTextContent(EXPLANATIONS.stale);
		await expect(start(pane).getAttribute('aria-describedby')).toContain(failure.id);
		// The ticks and the note are kept for another attempt.
		await expect(noteField(pane)).toHaveValue('Address the naming comments.');
		await expect(boxes(pane).map((box) => box.checked)).toEqual([true, false, false]);
		await expect(start(pane)).toHaveTextContent('Start round with 1 comment');
		await expect(start(pane)).toBeEnabled();
	}}
/>

<Story
	name="Not at handoff"
	args={build({ availability: disabled(ACTION_REASONS.notAtHandoff), pending: null })}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(within(pane).getByRole('heading', { name: 'Feedback rounds' })).toBeVisible();
		// A subpanel: the heading sits in the box's own header band, the content in its body.
		const box = pane.querySelector('[data-slot="feedback-rounds"]');
		await expect(box?.querySelector('[data-slot="feedback-rounds-header"] h3')).toHaveTextContent(
			'Feedback rounds'
		);
		await expect(
			box?.querySelector('[data-slot="feedback-rounds-body"] [data-testid="feedback-start"]')
		).not.toBeNull();
		await expect(pane.querySelector('[data-testid="pending-feedback"]')).toBeNull();
		await expect(within(pane).queryByRole('button', { name: 'Refresh' })).toBeNull();
		await expect(start(pane)).toBeDisabled();
		await expect(start(pane)).toHaveTextContent('Start round');
		await expect(pane.querySelector('[data-reason="feedback"]')).toHaveTextContent(
			ACTION_REASONS.notAtHandoff
		);
		await userEvent.click(start(pane), { pointerEventsCheck: 0 });
		await expect(args.onstart).not.toHaveBeenCalled();
	}}
/>

<Story
	name="Merged pull request"
	args={build({ availability: disabled(ACTION_REASONS.pullRequestMerged), pending: null })}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(start(pane)).toBeDisabled();
		await expect(pane.querySelector('[data-reason="feedback"]')).toHaveTextContent(
			'The pull request is merged.'
		);
	}}
/>

<Story
	name="Earlier rounds only (read-only)"
	args={build({
		availability: disabled(ACTION_REASONS.notAtHandoff),
		pending: null,
		rounds: twoRounds
	})}
	play={async ({ canvasElement }) => {
		const pane = firstPane(canvasElement);
		const earlier = within(pane).getByTestId('earlier-rounds');
		await expect(within(earlier).getByRole('heading', { name: 'Earlier rounds' })).toBeVisible();
		// Read-only: no pending list, no start control, no checkbox.
		await expect(pane.querySelector('[data-testid="pending-feedback"]')).toBeNull();
		await expect(within(pane).queryByTestId('feedback-start')).toBeNull();
		await expect(within(pane).queryByRole('button', { name: 'Refresh' })).toBeNull();
		await expect(boxes(pane)).toHaveLength(0);

		const [one, two] = [...earlier.querySelectorAll<HTMLElement>('[data-round]')];
		await expect(one).toHaveAttribute('data-round', '1');
		await expect(two).toHaveAttribute('data-round', '2');
		await expect(within(one!).getByRole('heading', { name: 'Feedback round 1' })).toBeVisible();
		await expect(within(two!).getByRole('heading', { name: 'Feedback round 2' })).toBeVisible();
		await expect(one).toHaveTextContent('Done');
		await expect(one!.querySelectorAll('[data-item]')).toHaveLength(3);
		await expect(two!.querySelectorAll('[data-item]')).toHaveLength(1);

		const [thread, , note] = twoRounds[0]!.items;
		const threadRow = one!.querySelector<HTMLElement>(`[data-item="${thread!.id}"]`)!;
		await expect(threadRow).toHaveTextContent(thread!.id);
		await expect(threadRow).toHaveTextContent(thread!.author);
		await expect(threadRow).toHaveTextContent(thread!.location!);
		await expect(threadRow).toHaveTextContent(thread!.summary);
		await expect(threadRow).toHaveTextContent('Review thread');
		await expect(within(threadRow).getByRole('link')).toHaveAttribute('href', thread!.url!);
		await expect(within(threadRow).getByRole('link')).toHaveAttribute('target', '_blank');

		const noteRow = one!.querySelector<HTMLElement>(`[data-item="${note!.id}"]`)!;
		await expect(noteRow).toHaveAttribute('data-kind', 'note');
		await expect(noteRow).toHaveTextContent("Operator's note");
		await expect(noteRow).toHaveTextContent(note!.summary);
		await expect(within(noteRow).queryByRole('link')).toBeNull();
		await expect(within(noteRow).queryByTestId('ref')).toBeNull();

		const comment = twoRounds[1]!.items[0]!;
		const commentRow = two!.querySelector<HTMLElement>(`[data-item="${comment.id}"]`)!;
		await expect(commentRow).toHaveTextContent(comment.summary);
		await expect(within(commentRow).getByRole('link')).toHaveAttribute('href', comment.url!);
	}}
/>

<Story
	name="Earlier rounds with pending comments"
	args={build({ rounds: oneRound })}
	play={async ({ args, canvasElement }) => {
		const pane = firstPane(canvasElement);
		await expect(rows(pane)).toHaveLength(3);
		await expect(start(pane)).toBeEnabled();
		await expect(start(pane)).toHaveTextContent('Start round with 3 comments');
		const earlier = within(pane).getByTestId('earlier-rounds');
		await expect(earlier.querySelectorAll('[data-round]')).toHaveLength(1);
		await expect(within(earlier).getByRole('heading', { name: 'Feedback round 1' })).toBeVisible();
		// The earlier round's items have no checkbox; only the pending rows do.
		await expect(within(earlier).queryAllByRole('checkbox')).toHaveLength(0);
		await expect(boxes(pane)).toHaveLength(3);
		await userEvent.click(start(pane));
		await expect(args.onstart).toHaveBeenLastCalledWith({});
	}}
/>
