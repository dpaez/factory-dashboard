<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';

	import TicketComposer, {
		type TicketComposerInput
	} from '$lib/components/factory/ticket-composer.svelte';
	import { commandTarget, type CommandPhase } from '$lib/factory/commands';
	import { getCommandContext } from '$lib/factory/commands.svelte';
	import { startFailureMessage, type StartMode } from '$lib/factory/start';

	/**
	 * The New ticket page: the TicketComposer wired to the layout's coordinator.
	 *
	 * - One Start planning is one start intent. While it is pending the
	 *   coordinator returns it and sends nothing; an unconfirmed one is resent
	 *   under the same id.
	 * - Accepted opens the board on the returned ticket. The inspector's read
	 *   confirms it; nothing here claims it is running.
	 * - A failure stays on the form, next to its field, with the drafts kept.
	 */
	const coordinator = getCommandContext();

	let mode = $state<StartMode>('ref');
	let ref = $state('');
	let id = $state('');
	let text = $state('');

	/** The target of the start this page sent; its intent drives the composer. */
	let sentTarget = $state<string | null>(null);
	const intent = $derived(sentTarget === null ? undefined : coordinator?.intentFor(sentTarget));
	const phase: CommandPhase = $derived(intent?.phase ?? 'idle');
	const failure = $derived(
		intent && (phase === 'rejected' || phase === 'unconfirmed')
			? startFailureMessage(intent, 'ref' in intent.request ? 'ref' : 'brief')
			: null
	);

	function onsubmit(input: TicketComposerInput) {
		if (!coordinator) return;
		const command = { command: 'start', ...input } as const;
		sentTarget = commandTarget(command);
		const label = 'ref' in input ? `Start ${input.ref}` : `Start ${input.id}`;
		coordinator.submit(command, { label });
	}

	function onresend() {
		if (intent) coordinator?.retryDelivery(intent.id);
	}

	// Accepted: open the returned ticket's inspector on the board, once.
	let opened: string | null = null;
	$effect(() => {
		const ticket = intent?.accepted?.ticket;
		if (!intent || ticket === undefined || opened === intent.id) return;
		if (intent.phase !== 'accepted' && intent.phase !== 'confirmed') return;
		opened = intent.id;
		// Replace /new, so Back from the inspector does not reopen a spent composer.
		goto(`/?ticket=${encodeURIComponent(ticket)}`, { replaceState: true });
	});

	// Cancel goes back when the operator came from another page, else to the board.
	let cameFromApp = false;
	afterNavigate(({ from }) => {
		cameFromApp = from !== null;
	});
	function oncancel() {
		if (cameFromApp) history.back();
		else goto('/');
	}
</script>

<main class="flex flex-col gap-6">
	<section aria-labelledby="new-ticket-heading">
		<div class="mt-2 mb-8 flex flex-col">
			<h2 id="new-ticket-heading" class="not-prose text-4xl font-light">New ticket</h2>
			<p class="not-prose mt-2 text-sm font-extralight text-muted-foreground">
				Start planning from an issue reference or a written brief
			</p>
		</div>
		<TicketComposer
			bind:mode
			bind:ref
			bind:id
			bind:text
			{phase}
			{failure}
			access={coordinator?.access ?? 'unknown'}
			{onsubmit}
			{oncancel}
			{onresend}
		/>
	</section>
</main>
