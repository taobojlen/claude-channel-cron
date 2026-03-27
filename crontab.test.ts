import { describe, test, expect } from "bun:test";
import { addTask, removeTask, listTasks, type CronTask } from "./crontab.ts";

function makeFakeCrontab() {
  let content = "";
  return {
    read: async () => content,
    write: async (c: string) => { content = c; },
    get: () => content,
  };
}

describe("crontab", () => {
  describe("addTask", () => {
    test("adds a crontab entry with correct format", async () => {
      const crontab = makeFakeCrontab();
      await addTask(
        { task_id: "daily-analysis", cron: "0 9 * * *", prompt: "Analyze data" },
        8790,
        crontab.read,
        crontab.write,
      );
      const content = crontab.get();
      expect(content).toContain("0 9 * * *");
      expect(content).toContain("curl");
      expect(content).toContain("X-Task-Id: daily-analysis");
      expect(content).toContain("Analyze data");
      expect(content).toContain("# cron-channel: daily-analysis");
    });

    test("replaces existing entry with same task_id", async () => {
      const crontab = makeFakeCrontab();
      await addTask(
        { task_id: "t1", cron: "0 9 * * *", prompt: "First" },
        8790, crontab.read, crontab.write,
      );
      await addTask(
        { task_id: "t1", cron: "30 10 * * *", prompt: "Second" },
        8790, crontab.read, crontab.write,
      );
      const content = crontab.get();
      const matches = content.split("\n").filter(l => l.includes("# cron-channel: t1"));
      expect(matches).toHaveLength(1);
      expect(content).toContain("30 10 * * *");
      expect(content).toContain("Second");
      expect(content).not.toContain("First");
    });

    test("preserves other entries", async () => {
      const crontab = makeFakeCrontab();
      await addTask(
        { task_id: "a", cron: "0 8 * * *", prompt: "A" },
        8790, crontab.read, crontab.write,
      );
      await addTask(
        { task_id: "b", cron: "0 9 * * *", prompt: "B" },
        8790, crontab.read, crontab.write,
      );
      const content = crontab.get();
      expect(content).toContain("# cron-channel: a");
      expect(content).toContain("# cron-channel: b");
    });

    test("uses the provided port", async () => {
      const crontab = makeFakeCrontab();
      await addTask(
        { task_id: "t", cron: "* * * * *", prompt: "P" },
        9999, crontab.read, crontab.write,
      );
      expect(crontab.get()).toContain("http://127.0.0.1:9999/");
    });
  });

  describe("removeTask", () => {
    test("removes the matching entry", async () => {
      const crontab = makeFakeCrontab();
      await addTask({ task_id: "rm-me", cron: "0 9 * * *", prompt: "X" }, 8790, crontab.read, crontab.write);
      const removed = await removeTask("rm-me", crontab.read, crontab.write);
      expect(removed).toBe(true);
      expect(crontab.get()).not.toContain("rm-me");
    });

    test("returns false if task not found", async () => {
      const crontab = makeFakeCrontab();
      const removed = await removeTask("nonexistent", crontab.read, crontab.write);
      expect(removed).toBe(false);
    });

    test("preserves other entries", async () => {
      const crontab = makeFakeCrontab();
      await addTask({ task_id: "keep", cron: "0 8 * * *", prompt: "K" }, 8790, crontab.read, crontab.write);
      await addTask({ task_id: "drop", cron: "0 9 * * *", prompt: "D" }, 8790, crontab.read, crontab.write);
      await removeTask("drop", crontab.read, crontab.write);
      const content = crontab.get();
      expect(content).toContain("keep");
      expect(content).not.toContain("drop");
    });
  });

  describe("listTasks", () => {
    test("returns all managed tasks", async () => {
      const crontab = makeFakeCrontab();
      await addTask({ task_id: "a", cron: "0 8 * * *", prompt: "Do A" }, 8790, crontab.read, crontab.write);
      await addTask({ task_id: "b", cron: "30 14 * * 1-5", prompt: "Do B" }, 8790, crontab.read, crontab.write);
      const tasks = await listTasks(crontab.read);
      expect(tasks).toHaveLength(2);
      expect(tasks).toContainEqual({ task_id: "a", cron: "0 8 * * *", prompt: "Do A" });
      expect(tasks).toContainEqual({ task_id: "b", cron: "30 14 * * 1-5", prompt: "Do B" });
    });

    test("returns empty array when no tasks", async () => {
      const crontab = makeFakeCrontab();
      const tasks = await listTasks(crontab.read);
      expect(tasks).toEqual([]);
    });
  });
});
