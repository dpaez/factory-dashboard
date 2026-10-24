<script lang="ts" module>
	import type { StartMode } from '$lib/factory/start';

	/** What Start planning sends: exactly the active mode's fields, trimmed. */
	export type TicketComposerInput = { ref: string } | { id: string; text: string };

	export const COMPOSER_COPY = {
		refTab: 'Issue reference',
		briefTab: 'Written brief',
		refLabel: 'Issue reference',
		refHint: 'owner/repo#123, #123, an issue URL, or a tracker key such as KEY-123.',
		idLabel: 'ID',
		idHint: 'A short name for the ticket, such as dark-mode-audit.',
		textLabel: 'Brief',
		textHint: 'What the ticket should achieve, in your words.',
		submit: 'Start planning',
		submitting: 'Starting…',
		accepted: 'Start accepted, opening the ticket…',
		cancel: 'Cancel',
		resend: 'Resend',
		requiredRef: 'Enter an issue reference.',
		requiredId: 'Enter an ID.',
		requiredText: 'Write the brief.'
	} as const;

	export const MODE_LABELS: Record<StartMode, string> = {
		ref: COMPOSER_COPY.refTab,
		brief: COMPOSER_COPY.briefTab
	};
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { CommandAccess, CommandPhase } from '$lib/factory/commands';
	import type { StartField, StartFailureMessage } from '$lib/factory/start';
	import { ACTION_REASONS } from '$lib/factory/ticket-actions';

	/**
	 * Starts a ticket from an issue reference or a written brief (spec 03 →
	 * TicketComposer). Presentational: the parent owns the start intent and
	 * passes its phase and `startFailureMessage`; the drafts are bindable.
	 *
	 * - Start planning sends only the active mode's fields, trimmed. An empty
	 *   required field shows a message next to it and sends nothing.
	 * - Submitting and accepted lock the tabs and the button, so repeated
	 *   clicks or Enter send nothing more.
	 * - Field failures (validation, umbrella, tracker, conflict) sit next to
	 *   their field; access, unconfirmed and other failures at the form, with
	 *   Resend for unconfirmed. The drafts are never cleared.
	 */
	let {
		mode = $bindable('ref'),
		ref = $bindable(''),
		id = $bindable(''),
		text = $bindable(''),
		phase = 'idle',
		failure = null,
		access = 'unknown',
		onsubmit,
		oncancel,
		onresend
	}: {
		mode?: StartMode;
		ref?: string;
		id?: string;
		text?: string;
		/** The phase of the start intent this composer sent. */
		phase?: CommandPhase;
		/** The start's failure from `startFailureMessage`, shown when rejected or unconfirmed. */
		failure?: StartFailureMessage | null;
		access?: CommandAccess;
		onsubmit: (input: TicketComposerInput) => void;
		oncancel?: () => void;
		/** Resend an unconfirmed start under the same intent id. */
		onresend?: () => void;
	} = $props();

	const uid = $props.id();
	const ids = {
		ref: `${uid}-ref`,
		id: `${uid}-id`,
		text: `${uid}-text`,
		form: `${uid}-form-message`,
		reason: `${uid}-reason`
	};

	/** Client validation messages from the last blocked submit, cleared as the field fills. */
	let required = $state<Partial<Record<StartField, string>>>({});

	const readOnly = $derived(access === 'read_only');
	const pending = $derived(phase === 'submitting' || phase === 'accepted');
	const unconfirmed = $derived(!readOnly && phase === 'unconfirmed');
	const failed = $derived(phase === 'rejected' || phase === 'unconfirmed');
	const shownFailure = $derived(failed ? failure : null);
	const locked = $derived(readOnly || pending || unconfirmed);
	const formMessage = $derived(
		shownFailure && shownFailure.field === null && !readOnly ? shownFailure.message : null
	);

	function errorFor(field: StartField): string | undefined {
		if (required[field]) return required[field];
		if (!shownFailure) return undefined;
		return (
			shownFailure.fields[field] ??
			(shownFailure.field === field ? shownFailure.message : undefined)
		);
	}

	const errors = $derived({ ref: errorFor('ref'), id: errorFor('id'), text: errorFor('text') });

	function describedBy(field: StartField) {
		return [
			`${ids[field]}-hint`,
			errors[field] && `${ids[field]}-error`,
			formMessage && ids.form,
			readOnly && ids.reason
		]
			.filter(Boolean)
			.join(' ');
	}

	function clearRequired(field: StartField, value: string) {
		if (required[field] && value.trim() !== '') required = { ...required, [field]: undefined };
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (locked) return;
		if (mode === 'ref') {
			const value = ref.trim();
			required = value === '' ? { ref: COMPOSER_COPY.requiredRef } : {};
			if (value !== '') onsubmit({ ref: value });
			return;
		}
		const key = id.trim();
		const brief = text.trim();
		required = {
			...(key === '' && { id: COMPOSER_COPY.requiredId }),
			...(brief === '' && { text: COMPOSER_COPY.requiredText })
		};
		if (key !== '' && brief !== '') onsubmit({ id: key, text: brief });
	}

	const ERROR = 'border-l-2 border-l-signal-fault pl-2 font-mono wrap-anywhere';
	const NOTICE = 'border-l-2 bg-card px-2 py-1 font-mono wrap-anywhere';
</script>

{#snippet fieldError(field: StartField)}
	{#if errors[field]}
		<p id="{ids[field]}-error" class={ERROR} data-testid="composer-{field}-error">
			{errors[field]}
		</p>
	{/if}
{/snippet}

<form
	data-slot="ticket-composer"
	data-phase={phase}
	data-mode={mode}
	class="not-prose flex max-w-xl flex-col gap-4 text-xs/relaxed text-foreground"
	novalidate
	aria-busy={phase === 'submitting' ? 'true' : undefined}
	onsubmit={submit}
>
	<Tabs.Root bind:value={mode} data-testid="composer-tabs">
		<Tabs.List aria-label="Start from">
			<Tabs.Trigger value="ref" disabled={pending}>{COMPOSER_COPY.refTab}</Tabs.Trigger>
			<Tabs.Trigger value="brief" disabled={pending}>{COMPOSER_COPY.briefTab}</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="ref" class="flex flex-col gap-2 pt-3">
			<Label for={ids.ref}>{COMPOSER_COPY.refLabel}</Label>
			<Input
				id={ids.ref}
				name="ref"
				required
				autocomplete="off"
				spellcheck={false}
				class="rounded-none font-mono tabular-nums"
				bind:value={ref}
				readonly={pending || unconfirmed}
				aria-invalid={errors.ref ? 'true' : undefined}
				aria-describedby={describedBy('ref')}
				oninput={(event) => clearRequired('ref', event.currentTarget.value)}
			/>
			<p id="{ids.ref}-hint" class="text-foreground/75">{COMPOSER_COPY.refHint}</p>
			{@render fieldError('ref')}
		</Tabs.Content>
		<Tabs.Content value="brief" class="flex flex-col gap-3 pt-3">
			<div class="flex flex-col gap-2">
				<Label for={ids.id}>{COMPOSER_COPY.idLabel}</Label>
				<Input
					id={ids.id}
					name="id"
					required
					autocomplete="off"
					spellcheck={false}
					class="rounded-none font-mono tabular-nums"
					bind:value={id}
					readonly={pending || unconfirmed}
					aria-invalid={errors.id ? 'true' : undefined}
					aria-describedby={describedBy('id')}
					oninput={(event) => clearRequired('id', event.currentTarget.value)}
				/>
				<p id="{ids.id}-hint" class="text-foreground/75">{COMPOSER_COPY.idHint}</p>
				{@render fieldError('id')}
			</div>
			<div class="flex flex-col gap-2">
				<Label for={ids.text}>{COMPOSER_COPY.textLabel}</Label>
				<Textarea
					id={ids.text}
					name="text"
					required
					class="rounded-none"
					bind:value={text}
					readonly={pending || unconfirmed}
					aria-invalid={errors.text ? 'true' : undefined}
					aria-describedby={describedBy('text')}
					oninput={(event) => clearRequired('text', event.currentTarget.value)}
				/>
				<p id="{ids.text}-hint" class="text-foreground/75">{COMPOSER_COPY.textHint}</p>
				{@render fieldError('text')}
			</div>
		</Tabs.Content>
	</Tabs.Root>

	{#if readOnly}
		<p id={ids.reason} class="{NOTICE} border-l-signal-standby" data-testid="composer-reason">
			{ACTION_REASONS.readOnly}
		</p>
	{/if}
	{#if formMessage}
		<p
			id={ids.form}
			class="{NOTICE} border-l-signal-fault"
			role="alert"
			data-testid="composer-form-error"
		>
			{formMessage}
		</p>
	{/if}
	{#if phase === 'accepted'}
		<p class="font-mono text-foreground/75" role="status" data-testid="composer-accepted">
			{COMPOSER_COPY.accepted}
		</p>
	{/if}

	<div class="flex flex-wrap gap-2">
		{#if unconfirmed}
			<Button
				type="button"
				variant="outline"
				class="rounded-none"
				data-testid="composer-resend"
				aria-describedby={formMessage ? ids.form : undefined}
				onclick={() => onresend?.()}
			>
				{COMPOSER_COPY.resend}
			</Button>
		{:else}
			<Button
				type="submit"
				variant="default"
				class="rounded-none"
				data-testid="composer-submit"
				disabled={locked}
				aria-busy={phase === 'submitting' ? 'true' : undefined}
				aria-describedby={readOnly ? ids.reason : undefined}
			>
				{phase === 'submitting' ? COMPOSER_COPY.submitting : COMPOSER_COPY.submit}
			</Button>
		{/if}
		<Button type="button" variant="outline" class="rounded-none" onclick={() => oncancel?.()}>
			{COMPOSER_COPY.cancel}
		</Button>
	</div>
</form>
