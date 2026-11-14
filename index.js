import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from './db.js';
import { startScheduler } from './scheduler.js';
import { buildPlan } from './ai.js';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');
const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json({ limit: '100kb' }));

const wrap = fn => (req, res, next) => fn(req, res).catch(next);
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const parse = (schema, data) => { const r = schema.safeParse(data); if (!r.success) throw fail(400, r.error.issues[0].message); return r.data; };
const sign = u => jwt.sign({ sub: u.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const auth = (req, res, next) => {
  try { req.uid = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET).sub; next(); }
  catch { res.status(401).json({ error: 'Unauthorized' }); }
};
const publicUser = u => ({ id: u.id, name: u.name, email: u.email });

// ---- Auth ----
const limiter = rateLimit({ windowMs: 15 * 60e3, limit: 30 });
app.post('/api/auth/register', limiter, wrap(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(80), email: z.string().email().toLowerCase(), password: z.string().min(8).max(100) }), req.body);
  if (await prisma.user.findUnique({ where: { email: b.email } })) throw fail(409, 'Email already registered');
  const u = await prisma.user.create({ data: { name: b.name, email: b.email, passwordHash: await bcrypt.hash(b.password, 12), prefs: { create: {} } } });
  res.status(201).json({ token: sign(u), user: publicUser(u) });
}));
app.post('/api/auth/login', limiter, wrap(async (req, res) => {
  const b = parse(z.object({ email: z.string().email().toLowerCase(), password: z.string().min(1) }), req.body);
  const u = await prisma.user.findUnique({ where: { email: b.email } });
  if (!u || !(await bcrypt.compare(b.password, u.passwordHash))) throw fail(401, 'Invalid email or password');
  res.json({ token: sign(u), user: publicUser(u) });
}));
app.get('/api/auth/me', auth, wrap(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.uid } });
  if (!u) throw fail(401, 'Unauthorized');
  res.json(publicUser(u));
}));

// ---- Assignments ----
const aSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  deadline: z.coerce.date(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).default('PENDING'),
  subject: z.string().trim().max(80).optional().nullable(),
});
const category = a => a.status === 'COMPLETED' ? 'completed' : a.deadline < new Date() ? 'overdue'
  : a.deadline - Date.now() < 3 * 864e5 ? 'upcoming' : 'pending';
const decorate = a => ({ ...a, category: category(a) });

async function toData(uid, body) {
  const { subject, ...rest } = parse(aSchema, body);
  let subjectId = null;
  if (subject) subjectId = (await prisma.subject.upsert({ where: { userId_name: { userId: uid, name: subject } }, update: {}, create: { userId: uid, name: subject } })).id;
  return { ...rest, subjectId };
}
const owned = async (uid, id) => { const a = await prisma.assignment.findFirst({ where: { id, userId: uid }, include: { subject: true } }); if (!a) throw fail(404, 'Not found'); return a; };

app.get('/api/assignments', auth, wrap(async (req, res) => {
  const { q, category: cat, status } = req.query;
  const rows = await prisma.assignment.findMany({
    where: { userId: req.uid, ...(status && { status: String(status) }),
      ...(q && { OR: [{ title: { contains: String(q), mode: 'insensitive' } }, { description: { contains: String(q), mode: 'insensitive' } }] }) },
    include: { subject: true }, orderBy: { deadline: 'asc' },
  });
  res.json(rows.map(decorate).filter(a => !cat || a.category === cat));
}));
app.post('/api/assignments', auth, wrap(async (req, res) => {
  const a = await prisma.assignment.create({ data: { ...(await toData(req.uid, req.body)), userId: req.uid }, include: { subject: true } });
  res.status(201).json(decorate(a));
}));
app.get('/api/assignments/:id', auth, wrap(async (req, res) => res.json(decorate(await owned(req.uid, req.params.id)))));
app.put('/api/assignments/:id', auth, wrap(async (req, res) => {
  await owned(req.uid, req.params.id);
  const a = await prisma.assignment.update({ where: { id: req.params.id }, data: await toData(req.uid, req.body), include: { subject: true } });
  // Deadline moved? Let reminders fire again.
  await prisma.notification.deleteMany({ where: { assignmentId: a.id, read: false } });
  res.json(decorate(a));
}));
app.delete('/api/assignments/:id', auth, wrap(async (req, res) => {
  await owned(req.uid, req.params.id);
  await prisma.assignment.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

// ---- Stats, notifications, subjects, AI ----
app.get('/api/stats', auth, wrap(async (req, res) => {
  const all = (await prisma.assignment.findMany({ where: { userId: req.uid } })).map(decorate);
  const n = c => all.filter(a => a.category === c).length;
  const today = new Date().toDateString();
  res.json({
    total: all.length, completed: n('completed'), overdue: n('overdue'),
    pending: all.length - n('completed') - n('overdue'),
    upcoming: all.filter(a => a.category === 'upcoming').slice(0, 5),
    dueToday: all.filter(a => a.status !== 'COMPLETED' && a.deadline.toDateString() === today),
    completionPct: all.length ? Math.round((n('completed') / all.length) * 100) : 0,
  });
}));
app.get('/api/notifications', auth, wrap(async (req, res) =>
  res.json(await prisma.notification.findMany({ where: { userId: req.uid }, orderBy: { createdAt: 'desc' }, take: 100 }))));
app.patch('/api/notifications/read-all', auth, wrap(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.uid, read: false }, data: { read: true } });
  res.status(204).end();
}));
app.patch('/api/notifications/:id/read', auth, wrap(async (req, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.uid }, data: { read: true } });
  res.status(204).end();
}));
app.get('/api/subjects', auth, wrap(async (req, res) => res.json(await prisma.subject.findMany({ where: { userId: req.uid }, orderBy: { name: 'asc' } }))));
app.post('/api/ai/plan', auth, wrap(async (req, res) => {
  const open = await prisma.assignment.findMany({ where: { userId: req.uid, status: { not: 'COMPLETED' } }, orderBy: { deadline: 'asc' }, take: 20 });
  res.json(await buildPlan(open));
}));

app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error' });
});

app.listen(process.env.PORT || 4000, () => { console.log('API ready'); startScheduler(); });
