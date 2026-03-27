# claude-cron-channel

A [Claude Code channel](https://code.claude.com/docs/en/channels) that lets Ubuntu's cron daemon push scheduled prompts into a long-lived Claude Code CLI session.

## Why

Claude Code's built-in `/loop` and `CronCreate` expire after 3 days. This channel has no expiry -- the OS cron daemon owns the schedule, and the MCP server is just a thin HTTP-to-channel bridge.

## How it works

```
crontab (curl)  -->  HTTP server (:8790)  -->  MCP notification  -->  Claude Code session
```

1. You tell Claude "do X every day at 9am"
2. Claude calls the `cron_add_task` tool, which writes a crontab entry
3. At 9am each day, cron runs `curl` against the local HTTP endpoint
4. The MCP server forwards the POST body as a channel notification
5. Claude processes the prompt in the existing session

The server binds to `127.0.0.1` only -- nothing outside your machine can reach it.

## Requirements

- [Bun](https://bun.sh) runtime
- Claude Code v2.1.80+ with claude.ai login
- Ubuntu (or any system with `crontab`)

## Setup

```bash
git clone <this-repo> && cd claude-cron-channel
bun install
```

Start Claude Code with the channel, and **disable the built-in scheduler** to avoid confusing Claude with two sets of cron tools:

```bash
CLAUDE_CODE_DISABLE_CRON=1 claude --dangerously-load-development-channels server:cron
```

`CLAUDE_CODE_DISABLE_CRON=1` removes the built-in `CronCreate`, `CronDelete`, `CronList` tools and `/loop` command. These have a 3-day expiry and would compete with this channel's tools. With them disabled, only `cron_add_task`, `cron_remove_task`, and `cron_list_tasks` are available.

## Usage

Just talk to Claude:

> "Every weekday at 9am, analyze the data in ~/data/metrics.csv and send me a summary of key trends."

> "List my scheduled tasks."

> "Remove the daily-analysis task."

Claude manages the crontab entries through three MCP tools:

| Tool | Description |
|------|-------------|
| `cron_add_task` | Add or replace a task in crontab with a cron expression and prompt |
| `cron_remove_task` | Remove a task by its ID |
| `cron_list_tasks` | List all managed tasks |

### Manual trigger

You can also fire any prompt into the session directly:

```bash
curl -s -X POST \
  -H "X-Task-Id: ad-hoc" \
  -d "Check if the deploy finished and tell me what happened." \
  http://127.0.0.1:8790/
```

## Configuration

| Environment variable | Default | Description |
|----------------------|---------|-------------|
| `CRON_CHANNEL_PORT` | `8790` | HTTP listener port |

## Delivering results

This is a one-way channel -- it injects prompts but has no reply tool. To get results delivered to you, include delivery instructions in the prompt:

- **Telegram/iMessage/Discord**: Run Claude Code with a chat channel alongside this one, and tell the prompt to reply there
- **File output**: "Write the summary to ~/reports/daily.md"
- **Email**: "Send the summary to me@example.com using `mail`"

## How crontab entries look

Each managed entry is tagged so the tools can find and update it:

```crontab
0 9 * * * curl -s -X POST -H "X-Task-Id: daily-analysis" -d "Analyze the data" http://127.0.0.1:8790/ # cron-channel: daily-analysis
```

Your existing crontab entries are left untouched.

## Install script

For managing tasks outside of Claude, `install.sh` provides a CLI:

```bash
./install.sh add "daily-analysis" "0 9 * * *" "Analyze the data"
./install.sh list
./install.sh remove "daily-analysis"
```

## Tests

```bash
# All tests
bun test && bash install.test.sh
```

## Limitations

- The MCP server only runs while Claude Code is running. If the session is down when cron fires, `curl` fails silently and the prompt is lost.
- If Claude is mid-response when a cron event arrives, the event queues until Claude is idle.
- No catch-up for missed fires.
- Prompts with special characters (quotes, `$`, backticks) in crontab entries may need care. For complex prompts, consider reading from a file instead.
