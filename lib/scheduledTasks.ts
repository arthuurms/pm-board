import { prisma } from "./prisma";

// Brasília is a fixed UTC-3 (no DST since 2019), same assumption as the MCP route.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

// Creates today's Task for every active schedule whose time has passed and that hasn't
// generated one yet. Safe to call as often as you like, and from several processes at once:
// the (scheduledTaskId, scheduledDate) unique index makes a second create fail harmlessly.
export async function runDueScheduledTasks(now: Date = new Date()): Promise<number> {
  const brt = new Date(now.getTime() - BRT_OFFSET_MS);
  const y = brt.getUTCFullYear();
  const m = brt.getUTCMonth();
  const d = brt.getUTCDate();
  const weekday = brt.getUTCDay();
  const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const schedules = await prisma.scheduledTask.findMany({
    where: { active: true, daysOfWeek: { has: weekday } },
  });

  if (schedules.length === 0) return 0;
  const alreadyToday = new Set(
    (
      await prisma.task.findMany({
        where: { scheduledDate: dateStr, scheduledTaskId: { in: schedules.map((s) => s.id) } },
        select: { scheduledTaskId: true },
      })
    ).map((t) => t.scheduledTaskId)
  );

  let created = 0;
  for (const s of schedules) {
    if (alreadyToday.has(s.id)) continue;
    const [hh, mm] = s.timeOfDay.split(":").map(Number);
    const scheduledAt = new Date(Date.UTC(y, m, d, hh, mm) + BRT_OFFSET_MS);
    if (scheduledAt > now) continue; // not time yet today
    if (scheduledAt < s.createdAt) continue; // schedule was created after today's slot; start tomorrow

    try {
      await prisma.$transaction(async (tx) => {
        const task = await tx.task.create({
          data: {
            title: s.title,
            description: s.description,
            priority: s.priority,
            dueDate: new Date(scheduledAt.getTime() + s.dueInHours * 60 * 60 * 1000),
            assigneeId: s.assigneeId,
            creatorId: s.creatorId,
            tagId: s.tagId,
            scheduledTaskId: s.id,
            scheduledDate: dateStr,
          },
        });
        await tx.statusHistory.create({
          data: { taskId: task.id, fromStatus: null, toStatus: "pending", changedById: s.creatorId },
        });
      });
      created++;
    } catch (err) {
      // P2002 = unique violation: today's task already exists, which is the normal case.
      if ((err as { code?: string }).code !== "P2002") {
        console.error(`Scheduled task ${s.id} failed:`, err);
      }
    }
  }
  return created;
}
