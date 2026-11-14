import cron from 'node-cron';
import { prisma } from './db.js';

const WINDOWS = [[1, 'remind1'], [12, 'remind12'], [24, 'remind24']]; // ascending hours

export async function runReminders(now = new Date()) {
  const horizon = new Date(now.getTime() + 24 * 3600e3);
  const items = await prisma.assignment.findMany({
    where: { status: { not: 'COMPLETED' }, deadline: { gt: now, lte: horizon } },
    include: { user: { include: { prefs: true } } },
  });
  for (const a of items) {
    const hoursLeft = (a.deadline - now) / 3600e3;
    // Pick only the tightest enabled window that applies, so late-created items don't get 3 alerts at once.
    const hit = WINDOWS.find(([h, key]) => hoursLeft <= h && (a.user.prefs?.[key] ?? true));
    if (!hit) continue;
    try {
      await prisma.notification.create({
        data: { userId: a.userId, assignmentId: a.id, kind: `R${hit[0]}`,
          message: `"${a.title}" is due within ${hit[0]} hour${hit[0] > 1 ? 's' : ''}.` },
      });
    } catch (e) { if (e.code !== 'P2002') throw e; } // P2002 = already notified, ignore
  }
}

export const startScheduler = () =>
  cron.schedule('* * * * *', () => runReminders().catch(e => console.error('reminder job failed', e)));
