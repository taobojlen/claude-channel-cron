import { $ } from "bun";

const TAG = "# cron-channel:";

export type CronTask = {
  task_id: string;
  cron: string;
  prompt: string;
};

async function readCrontab(): Promise<string> {
  try {
    const result = await $`crontab -l`.text();
    return result;
  } catch {
    return "";
  }
}

async function writeCrontab(content: string): Promise<void> {
  await $`echo ${content} | crontab -`.quiet();
}

export async function addTask(
  task: CronTask,
  port: number,
  read = readCrontab,
  write = writeCrontab,
): Promise<void> {
  const existing = await read();
  const filtered = existing
    .split("\n")
    .filter((line) => !line.endsWith(`${TAG} ${task.task_id}`))
    .join("\n");
  const entry = `${task.cron} curl -s -X POST -H "X-Task-Id: ${task.task_id}" -d "${task.prompt}" http://127.0.0.1:${port}/ ${TAG} ${task.task_id}`;
  const lines = filtered.trim() ? `${filtered.trim()}\n${entry}` : entry;
  await write(lines);
}

export async function removeTask(
  taskId: string,
  read = readCrontab,
  write = writeCrontab,
): Promise<boolean> {
  const existing = await read();
  const lines = existing.split("\n");
  const filtered = lines.filter(
    (line) => !line.endsWith(`${TAG} ${taskId}`),
  );
  if (filtered.length === lines.length) return false;
  await write(filtered.join("\n"));
  return true;
}

export async function listTasks(
  read = readCrontab,
): Promise<CronTask[]> {
  const existing = await read();
  return existing
    .split("\n")
    .filter((line) => line.includes(TAG))
    .map((line) => {
      const taskId = line.split(`${TAG} `).pop()!;
      const cron = line.substring(0, line.indexOf(" curl"));
      const promptMatch = line.match(/-d "([^"]*)"/)
      const prompt = promptMatch ? promptMatch[1] : "";
      return { task_id: taskId, cron, prompt };
    });
}
