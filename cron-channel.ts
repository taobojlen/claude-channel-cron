#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { addTask, removeTask, listTasks } from "./crontab.ts";

export const server = new Server(
  { name: "cron", version: "0.0.1" },
  {
    capabilities: {
      experimental: { "claude/channel": {} },
      tools: {},
    },
    instructions: [
      "Events from the cron channel are scheduled tasks fired by the system crontab.",
      "Execute the prompt in the channel body. The task_id meta field identifies which scheduled task fired.",
      "You can manage scheduled tasks using the cron_add_task, cron_remove_task, and cron_list_tasks tools.",
      "When the user asks to schedule something, use cron_add_task with a 5-field cron expression and the prompt to run.",
    ].join(" "),
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "cron_add_task",
      description:
        "Schedule a recurring task by adding it to the system crontab. The task fires at the specified cron schedule and injects the prompt into this session.",
      inputSchema: {
        type: "object" as const,
        properties: {
          task_id: {
            type: "string",
            description:
              "Unique identifier for the task (lowercase, hyphens ok). Used to replace or remove it later.",
          },
          cron: {
            type: "string",
            description:
              "5-field cron expression: minute hour day-of-month month day-of-week. Example: '0 9 * * *' for daily at 9am.",
          },
          prompt: {
            type: "string",
            description: "The prompt to inject into the session when the task fires.",
          },
        },
        required: ["task_id", "cron", "prompt"],
      },
    },
    {
      name: "cron_remove_task",
      description: "Remove a scheduled task from the crontab by its task_id.",
      inputSchema: {
        type: "object" as const,
        properties: {
          task_id: {
            type: "string",
            description: "The task_id of the task to remove.",
          },
        },
        required: ["task_id"],
      },
    },
    {
      name: "cron_list_tasks",
      description: "List all scheduled cron-channel tasks currently in the crontab.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const port = getPort();

  switch (name) {
    case "cron_add_task": {
      const { task_id, cron, prompt } = args as {
        task_id: string;
        cron: string;
        prompt: string;
      };
      await addTask({ task_id, cron, prompt }, port);
      return {
        content: [
          {
            type: "text" as const,
            text: `Scheduled task "${task_id}" with cron "${cron}". It will POST to http://127.0.0.1:${port}/ on each fire.`,
          },
        ],
      };
    }
    case "cron_remove_task": {
      const { task_id } = args as { task_id: string };
      const removed = await removeTask(task_id);
      return {
        content: [
          {
            type: "text" as const,
            text: removed
              ? `Removed task "${task_id}" from crontab.`
              : `Task "${task_id}" not found in crontab.`,
          },
        ],
      };
    }
    case "cron_list_tasks": {
      const tasks = await listTasks();
      if (tasks.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No scheduled tasks." }],
        };
      }
      const lines = tasks.map(
        (t) => `- ${t.task_id}: "${t.cron}" → ${t.prompt}`,
      );
      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const DEFAULT_PORT = 8790;

export function getPort(): number {
  const env = process.env.CRON_CHANNEL_PORT;
  return env ? parseInt(env, 10) : DEFAULT_PORT;
}

export function startHttpServer(port: number) {
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      if (req.method !== "POST") {
        return new Response("method not allowed", { status: 405 });
      }
      const body = await req.text();
      if (!body.trim()) {
        return new Response("empty body", { status: 400 });
      }
      const meta: Record<string, string> = {};
      const taskId = req.headers.get("X-Task-Id");
      const taskName = req.headers.get("X-Task-Name");
      if (taskId) meta.task_id = taskId;
      if (taskName) meta.task_name = taskName;
      await server.notification({
        method: "notifications/claude/channel",
        params: {
          content: body,
          meta,
        },
      });
      return new Response("ok");
    },
  });
}

// Main entrypoint: connect to Claude Code over stdio and start HTTP listener
if (import.meta.main) {
  await server.connect(new StdioServerTransport());
  const port = getPort();
  startHttpServer(port);
  process.stderr.write(`cron-channel: listening on http://127.0.0.1:${port}\n`);
}
