<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import { Tween } from "svelte/motion";

  import { cn } from "$lib/utils";
  import { Progress } from "$lib/components/ui/progress";
  type TimelineProps = {
    steps: string[];
    currentStep: number;
    totalSteps: number;
  }
  const { steps, currentStep, totalSteps }: TimelineProps = $props();
  const tween = new Tween(0, { duration: 800, easing: cubicInOut });
  const value = $derived(currentStep / totalSteps * 100);
  $effect(() => {
    tween.set(value);
  });
</script>

<div class="flex flex-col gap-2 w-full">
  <Progress 
    class="overflow-hidden **:data-[slot=progress-indicator]:transition-none" 
    value={Math.round(tween.current)} 
    max={100} />
  <div class="relative -mt-4.5 h-10 w-full">  
    {#each steps as step, index}
      {@const t = index / (steps.length - 1)}
      {@const isFirst = index === 0}
      {@const isLast = index === steps.length - 1}
      {@const reached = t === 0 ? tween.current > 0 : tween.current >= t * 100}

      <div
        class="absolute flex flex-col {isFirst
          ? 'items-start'
          : isLast
            ? 'items-end'
            : 'items-center'}"
        style="left: {t * 100}%; transform: translateX({isFirst
          ? '0'
          : isLast
            ? '-100%'
            : '-50%'})"
      >
        <div
          class={cn(
            "size-4 rounded-full",
            reached ? "bg-primary" : "bg-muted",
          )}
        ></div>
        <p class="not-prose mt-1 text-xs capitalize text-muted-foreground">{step}</p>
      </div>
    {/each}
  </div>

</div>