## Factory dashboard

The dashboard runs on container port 7732 (`factory-dashboard`). The host port comes from `sbx ports <sandbox>`.

It reads `.factory/dashboard.env`, which `factory-up` writes.

The log is at `~/.local/state/factory-dashboard/dashboard.log`.
