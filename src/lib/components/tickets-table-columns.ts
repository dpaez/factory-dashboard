import { createColumnHelper, renderComponent } from "@tanstack/svelte-table";
import TicketsTableTitleCell from "./tickets-table-title-cell.svelte";
import TicketsTableStatusCell from "./tickets-table-status-cell.svelte";
import TicketsTableCostCell from "./tickets-table-cost-cell.svelte";
import type { TicketsTableFeatures } from "./tickets-table-features.js";

export type WorktreeType = {
  path: string;
  branch: string;
  baseBranch?: string;
  workspaceId: string;
  removed?: boolean;
};

export type StatusType =
  | "active"
  | "complete"
  | "done"
  | "in_progress"
  | "blocked"
  | "reviewing"
  | "ready_for_review";
export type StageType = "plan" | "work" | "review" | "wrapup" | "done";

export type TaskType = {
  status: StatusType;
  blockedBy: string[];
  updatedAt?: string | null;
  review: {
    round: number;
    verdict: "approve" | "reject" | null;
    findingCount: number | null;
    blockingCount: number | null;
    updatedAt: string | null;
  } | null;
};

export type SessionType = {
  stage: StageType;
  task: string | null;
  round: number | null;
  model: string;
  paneId: string | null;
  paneName: string | null;
  sessionFile: string;
  status: string;
  context: {
    tokens: number;
    window: number;
    percent: number;
  } | null;
  startedAt: string | null;
  updatedAt: string | null;
};

export type UsageType = {
  stage: StageType;
  task: string | null;
  round: number | null;
  model: string;
  throughEntryId: string;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  costUsd: number;
  recordedAt: string | null;
};

export type Ticket = {
  id: string;
  type: "bug" | "feature" | "refactor" | "performance task" | "investigation" | "documentation";
  title: string;
  message: string;
  messageAt: string | null;
  stage: StageType;
  status: StatusType;
  currentTask?: string;
  source?: {
    kind: string;
    ref: string;
  };
  worktree: WorktreeType;
  blocker: string[] | null;
  tasks: Record<string, TaskType>;
  sessions: Record<string, SessionType>;
  usage: Record<string, UsageType>;
  createdAt: string | null;
  updatedAt: string | null;
};
 
// Use `accessor` for data columns and `display` for columns without one.
const columnHelper = createColumnHelper<TicketsTableFeatures, Ticket>();
 
export const columns = columnHelper.columns([
  columnHelper.accessor("id", {
    header: "ID",
  }),
  columnHelper.accessor("title", {
    header: "Title",
    cell: ({ row }) =>
      renderComponent(TicketsTableTitleCell, {
        type: row.original.type,
        title: row.original.title,
      }),

  }),
  columnHelper.accessor("stage", {
    header: "Stage",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: ({ row }) =>
      renderComponent(TicketsTableStatusCell, {
        status: row.original.status,
      }),
  }),
  columnHelper.accessor(
    (row) => Object.values(row.usage).reduce((sum, entry) => sum + entry.costUsd, 0),
    {
      id: "cost",
      header: "Cost",
      cell: ({ row }) =>
        renderComponent(TicketsTableCostCell, {
          cost: row.getValue("cost"),
        }),
    }),
    
]);

const ticketsById: Record<string, Omit<Ticket, "id">> = {
    "PROJ-13": {
      "stage": "done",
      "status": "complete",
      "currentTask": "01",
      "message": "Ticket complete. Wrap-up handoff validated (usage $0.1048); re-verified 118/118 tests, oxlint 0/0, tsgo clean in worktree. Total ticket usage $2.2831. Human owns commit/merge (commands in wrap-up session).",
      "blocker": null,
      "worktree": {
        "path": "/home/agent/.herdr/worktrees/chan/PROJ-13",
        "branch": "PROJ-13",
        "baseBranch": "dp/new-ai-module",
        "workspaceId": "w1"
      },
      "tasks": {
        "01": {
          "status": "done",
          "blockedBy": [],
          "review": {
            "round": 0,
            "verdict": "approve",
            "findingCount": 0,
            "blockingCount": 0,
            "updatedAt": null
          }
        }
      },
      "sessions": {
        "91dba753-319ad4a0-c1134ac2-edbc": {
          "stage": "plan",
          "task": null,
          "model": "opencode/claude-fable-5",
          "paneId": null,
          "sessionFile": "/home/agent/.pi/agent/sessions/--home-agent-.herdr-worktrees-chan-PROJ-13--/2026-09-10T13-38-03-868Z_91dba753-319ad4a0-c1134ac2-edbc.jsonl",
          "status": "completed",
          "round": null,
          "paneName": null,
          "context": null,
          "startedAt": null,
          "updatedAt": null
        },
        "9f253d45-a73d290e-2bcf9827-e9a6": {
          "stage": "work",
          "task": "01",
          "model": "opencode/glm-5.3",
          "paneId": null,
          "sessionFile": "/home/agent/.pi/agent/sessions/--home-agent-.herdr-worktrees-chan-PROJ-13--/2026-09-10T13-42-03-240Z_9f253d45-a73d290e-2bcf9827-e9a6.jsonl",
          "status": "completed",
          "round": null,
          "paneName": null,
          "context": null,
          "startedAt": null,
          "updatedAt": null
        },
        "569ebc0e-8de7464b-0d029bac-7f7f": {
          "stage": "review",
          "task": "01",
          "model": "opencode/kimi-k3",
          "paneId": null,
          "sessionFile": "/home/agent/.pi/agent/sessions/--home-agent-.herdr-worktrees-chan-PROJ-13--/2026-09-10T13-46-52-649Z_569ebc0e-8de7464b-0d029bac-7f7f.jsonl",
          "status": "completed",
          "round": null,
          "paneName": null,
          "context": null,
          "startedAt": null,
          "updatedAt": null
        },
        "46ca1a56-13040512-cc4b3333-d3c9": {
          "stage": "wrapup",
          "task": "01",
          "model": "opencode/glm-5.3",
          "paneId": null,
          "sessionFile": "/home/agent/.pi/agent/sessions/--home-agent-.herdr-worktrees-chan-PROJ-13--/2026-09-10T13-53-17-896Z_46ca1a56-13040512-cc4b3333-d3c9.jsonl",
          "status": "completed",
          "round": null,
          "paneName": null,
          "context": null,
          "startedAt": null,
          "updatedAt": null
        }
      },
      "usage": {
        "91dba753-319ad4a0-c1134ac2-edbc": {
          "stage": "plan",
          "task": null,
          "model": "opencode/claude-fable-5",
          "throughEntryId": "72d3cedb",
          "tokens": {
            "input": 27,
            "output": 10580,
            "cacheRead": 302926,
            "cacheWrite": 39783,
            "total": 353316
          },
          "costUsd": 1.3295,
          "round": null,
          "recordedAt": null
        },
        "9f253d45-a73d290e-2bcf9827-e9a6": {
          "stage": "work",
          "task": "01",
          "model": "opencode/glm-5.3",
          "throughEntryId": "607b6380",
          "tokens": {
            "input": 44003,
            "output": 18717,
            "cacheRead": 746637,
            "cacheWrite": 0,
            "total": 809357
          },
          "costUsd": 0.3381,
          "round": null,
          "recordedAt": null
        },
        "569ebc0e-8de7464b-0d029bac-7f7f": {
          "stage": "review",
          "task": "01",
          "model": "opencode/kimi-k3",
          "throughEntryId": "50d99db1",
          "tokens": {
            "input": 48225,
            "output": 13964,
            "cacheRead": 521856,
            "cacheWrite": 0,
            "total": 584045
          },
          "costUsd": 0.5107,
          "round": null,
          "recordedAt": null
        },
        "46ca1a56-13040512-cc4b3333-d3c9": {
          "stage": "wrapup",
          "task": "01",
          "model": "opencode/glm-5.3",
          "throughEntryId": "1978dac1",
          "tokens": {
            "input": 22850,
            "output": 7858,
            "cacheRead": 147140,
            "cacheWrite": 0,
            "total": 177848
          },
          "costUsd": 0.1048,
          "round": null,
          "recordedAt": null
        }
      },
      "createdAt": null,
      "updatedAt": null,
      "messageAt": null,
      "source": {
        "kind": "file",
        "ref": "docs/issues/13-*.md"
      },
      "title": "Wire Inspection into chan init",
      "type": "feature"
    },
    "PROJ-14": {
      "title": "Document Context generation in chan README",
      "type": "documentation",
      "source": {
        "kind": "file",
        "ref": "docs/issues/14-document-init-context.md"
      },
      "stage": "review",
      "status": "active",
      "currentTask": "01",
      "message": "Work validated (factory.work.v2, ready_for_review after one resume; usage $0.3156 cumulative). Review round 1 starting under factory.review.v3 (kimi-k3, read-only, full packet).",
      "messageAt": "2026-09-12T00:03:01Z",
      "blocker": null,
      "createdAt": "2026-09-11T23:46:12Z",
      "updatedAt": "2026-09-12T00:03:01Z",
      "worktree": {
        "path": "/home/agent/.herdr/worktrees/chan/PROJ-14",
        "branch": "PROJ-14",
        "baseBranch": "dp/new-ai-module",
        "workspaceId": "w1"
      },
      "tasks": {
        "01": {
          "status": "ready_for_review",
          "blockedBy": [],
          "updatedAt": "2026-09-12T00:03:01Z",
          "review": {
            "round": 1,
            "verdict": null,
            "findingCount": null,
            "blockingCount": null,
            "updatedAt": null
          }
        }
      },
      "sessions": {
        "196cf67b-2f685f8b-80373f6c-aad8": {
          "stage": "plan",
          "task": null,
          "round": null,
          "model": "opencode-go/qwen3.8-flash",
          "paneId": "w1:pR",
          "paneName": "PROJ-14 \u00b7 plan",
          "sessionFile": "/home/agent/.pi/agent/sessions/--home-agent-.herdr-worktrees-chan-PROJ-14--/2026-09-11T23-46-23-433Z_196cf67b-2f685f8b-80373f6c-aad8.jsonl",
          "status": "completed",
          "context": {
            "tokens": 27406,
            "window": 1000000,
            "percent": 2.74
          },
          "startedAt": null,
          "updatedAt": "2026-09-11T23:57:56Z"
        },
        "4c821d94-ac929a2f-8b2b0cd6-66b6": {
          "stage": "work",
          "task": "01",
          "round": null,
          "model": "opencode-go/gpt-5.6-luna",
          "paneId": "w1:pT",
          "paneName": "PROJ-14 \u00b7 work T01",
          "sessionFile": "/home/agent/.pi/agent/sessions/--home-agent-.herdr-worktrees-chan-PROJ-14--/2026-09-11T23-58-04-330Z_4c821d94-ac929a2f-8b2b0cd6-66b6.jsonl",
          "status": "completed",
          "context": {
            "tokens": 32425,
            "window": 1000000,
            "percent": 3.24
          },
          "startedAt": null,
          "updatedAt": "2026-09-12T00:03:01Z"
        }
      },
      "usage": {
        "196cf67b-2f685f8b-80373f6c-aad8": {
          "stage": "plan",
          "task": null,
          "round": null,
          "model": "opencode-go/qwen3.8-flash",
          "throughEntryId": "5daf9029",
          "tokens": {
            "input": 32054,
            "output": 8083,
            "cacheRead": 180835,
            "cacheWrite": 8829,
            "total": 229801
          },
          "costUsd": 0.2851,
          "recordedAt": "2026-09-11T23:57:56Z"
        },
        "4c821d94-ac929a2f-8b2b0cd6-66b6": {
          "stage": "work",
          "task": "01",
          "round": null,
          "model": "opencode-go/gpt-5.6-luna",
          "throughEntryId": "af2851fc",
          "tokens": {
            "input": 70249,
            "output": 12415,
            "cacheRead": 402304,
            "cacheWrite": 0,
            "total": 484968
          },
          "costUsd": 0.3156,
          "recordedAt": "2026-09-12T00:03:01Z"
        }
      }
    }
};

export const data: Ticket[] = Object.entries(ticketsById).map(([id, ticket]) => ({
  id,
  ...ticket,
}));