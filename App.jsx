import { useEffect, useState, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { LayoutDashboard, ListTodo, Bell, Sparkles, LogOut, Menu } from 'lucide-react';

async function api(path, { method = 'GET', body } = {}) {
  const t = localStorage.getItem('t');
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(t && { Authorization: 'Bearer ' + t }) }, body: body && JSON.stringify(body) });
  if (r.status === 204) return null;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Request failed'), { status: r.status });
  return d;
}
const remaining = iso => {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'Deadline passed';
  const h = Math.floor(ms / 36e5), d = Math.floor(h / 24);
  return d >= 1 ? `${d} day${d > 1 ? 's' : ''} remaining` : h >= 1 ? `${h} hour${h > 1 ? 's' : ''} remaining` : `${Math.max(1, Math.floor(ms / 6e4))} min remaining`;
};
const toLocalInput = iso => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login'), [f, setF] = useState({ name: '', email: '', password: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const d = await api(`/auth/${mode}`, { method: 'POST', body: f }); localStorage.setItem('t', d.token); onAuth(d.user); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <form onSubmit={submit} className="glass p-6 w-full max-w-sm space-y-3">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">StudyMate</h1>
        <p className="text-sm opacity-70">{mode === 'login' ? 'Welcome back' : 'Create your account'}</p>
        {mode === 'register' && <input className="inp" placeholder="Name" value={f.name} onChange={set('name')} required />}
        <input className="inp" type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
        <input className="inp" type="password" placeholder="Password (8+ chars)" value={f.password} onChange={set('password')} required minLength={8} />
        {err && <p role="alert" className="text-red-300 text-sm">{err}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}</button>
        <button type="button" className="text-sm underline opacity-80" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}</button>
      </form>
    </div>);
}

function Dashboard() {
  const [s, setS] = useState(null), [err, setErr] = useState('');
  useEffect(() => { api('/stats').then(setS).catch(e => setErr(e.message)); }, []);
  if (err) return <p role="alert">{err}</p>;
  if (!s) return <p className="animate-pulse">Loading…</p>;
  const data = [['Completed', s.completed, '#22d3ee'], ['Pending', s.pending, '#a78bfa'], ['Overdue', s.overdue, '#f87171']].map(([name, value, c]) => ({ name, value, c }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Total', s.total], ['Pending', s.pending], ['Completed', s.completed], ['Overdue', s.overdue]].map(([l, v]) =>
          <div key={l} className="glass p-4"><p className="text-sm opacity-70">{l}</p><p className="text-3xl font-bold">{v}</p></div>)}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="glass p-4 h-64"><p className="mb-1">Completion: {s.completionPct}%</p>
          {s.total ? <ResponsiveContainer width="100%" height="90%"><PieChart><Pie data={data} dataKey="value" innerRadius={50} outerRadius={80}>{data.map(d => <Cell key={d.name} fill={d.c} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
            : <p className="opacity-70">Add an assignment to see your chart.</p>}</div>
        <div className="glass p-4"><p className="mb-2 font-semibold">Upcoming deadlines</p>
          {s.upcoming.length ? s.upcoming.map(a => <p key={a.id} className="text-sm py-1">{a.title} · {remaining(a.deadline)}</p>) : <p className="opacity-70 text-sm">Nothing due in the next 3 days.</p>}
          <p className="mt-3 font-semibold">Due today</p>
          {s.dueToday.length ? s.dueToday.map(a => <p key={a.id} className="text-sm">{a.title}</p>) : <p className="opacity-70 text-sm">No tasks due today.</p>}</div>
      </div>
    </div>);
}

const blank = { title: '', subject: '', description: '', deadline: '', priority: 'MEDIUM', status: 'PENDING' };
function Assignments() {
  const [list, setList] = useState([]), [q, setQ] = useState(''), [cat, setCat] = useState(''), [form, setForm] = useState(null), [editId, setEditId] = useState(null), [err, setErr] = useState('');
  const load = useCallback(() => api(`/assignments?q=${encodeURIComponent(q)}&category=${cat}`).then(setList).catch(e => setErr(e.message)), [q, cat]);
  useEffect(() => { load(); }, [load]);
  const save = async e => {
    e.preventDefault(); setErr('');
    try {
      const body = { ...form, deadline: new Date(form.deadline).toISOString(), subject: form.subject || null };
      await api(editId ? `/assignments/${editId}` : '/assignments', { method: editId ? 'PUT' : 'POST', body });
      setForm(null); setEditId(null); load();
    } catch (x) { setErr(x.message); }
  };
  const edit = a => { setEditId(a.id); setForm({ title: a.title, subject: a.subject?.name || '', description: a.description || '', deadline: toLocalInput(a.deadline), priority: a.priority, status: a.status }); };
  const del = async a => { if (confirm(`Delete "${a.title}"?`)) { await api(`/assignments/${a.id}`, { method: 'DELETE' }); load(); } };
  const set = k => e => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="inp flex-1 min-w-40" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="inp w-auto" value={cat} onChange={e => setCat(e.target.value)}>{['', 'upcoming', 'pending', 'completed', 'overdue'].map(c => <option key={c} value={c} className="text-black">{c || 'All'}</option>)}</select>
        <button className="btn" onClick={() => { setEditId(null); setForm({ ...blank }); }}>+ New</button>
      </div>
      {err && <p role="alert" className="text-red-300">{err}</p>}
      {form && (
        <form onSubmit={save} className="glass p-4 grid sm:grid-cols-2 gap-3">
          <input className="inp" placeholder="Title" value={form.title} onChange={set('title')} required />
          <input className="inp" placeholder="Subject" value={form.subject} onChange={set('subject')} />
          <input className="inp" type="datetime-local" value={form.deadline} onChange={set('deadline')} required />
          <div className="flex gap-2">
            <select className="inp" value={form.priority} onChange={set('priority')}>{['LOW', 'MEDIUM', 'HIGH'].map(p => <option key={p} className="text-black">{p}</option>)}</select>
            <select className="inp" value={form.status} onChange={set('status')}>{['PENDING', 'IN_PROGRESS', 'COMPLETED'].map(p => <option key={p} className="text-black">{p}</option>)}</select>
          </div>
          <textarea className="inp sm:col-span-2" rows={3} placeholder="Description" value={form.description} onChange={set('description')} />
          <div className="sm:col-span-2 flex gap-2"><button className="btn">{editId ? 'Save' : 'Create'}</button><button type="button" className="inp w-auto" onClick={() => setForm(null)}>Cancel</button></div>
        </form>)}
      {!list.length && <p className="glass p-6 text-center opacity-70">No assignments yet. Click “+ New” to add one.</p>}
      {list.map(a => (
        <div key={a.id} className="glass p-4 flex flex-wrap items-center gap-3 justify-between">
          <div><p className="font-semibold">{a.title} <span className="text-xs opacity-60">{a.subject?.name}</span></p>
            <p className={`text-sm ${a.category === 'overdue' ? 'text-red-300' : a.category === 'upcoming' ? 'text-amber-300' : 'opacity-70'}`}>{a.status === 'COMPLETED' ? 'Completed' : remaining(a.deadline)} · {a.priority} · {a.category}</p></div>
          <div className="flex gap-2 text-sm">
            {a.status !== 'COMPLETED' && <button className="inp w-auto" onClick={async () => { await api(`/assignments/${a.id}`, { method: 'PUT', body: { ...a, subject: a.subject?.name || null, status: 'COMPLETED' } }); load(); }}>Done</button>}
            <button className="inp w-auto" onClick={() => edit(a)}>Edit</button>
            <button className="inp w-auto" onClick={() => del(a)}>Delete</button>
          </div>
        </div>))}
    </div>);
}

function Notifications({ items, reload }) {
  return (
    <div className="space-y-2">
      <button className="btn" onClick={async () => { await api('/notifications/read-all', { method: 'PATCH' }); reload(); }}>Mark all read</button>
      {!items.length && <p className="glass p-6 text-center opacity-70">No notifications yet. Reminders appear 24h, 12h and 1h before deadlines.</p>}
      {items.map(n => <div key={n.id} className={`glass p-3 flex justify-between gap-2 ${n.read ? 'opacity-50' : ''}`}><span>{n.message}</span>
        {!n.read && <button className="text-sm underline" onClick={async () => { await api(`/notifications/${n.id}/read`, { method: 'PATCH' }); reload(); }}>Mark read</button>}</div>)}
    </div>);
}

function AI() {
  const [r, setR] = useState(null), [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { setR(await api('/ai/plan', { method: 'POST' })); } finally { setBusy(false); } }}>{busy ? 'Planning…' : 'Plan my study schedule'}</button>
      {r && <div className="glass p-4"><p className="text-xs uppercase tracking-wide mb-2 text-cyan-300">{r.source === 'ai' ? 'AI-generated' : 'Rule-based fallback (no AI key configured or API unavailable)'}</p><pre className="whitespace-pre-wrap font-sans">{r.plan}</pre></div>}
    </div>);
}

export default function App() {
  const [user, setUser] = useState(undefined), [page, setPage] = useState('dash'), [notes, setNotes] = useState([]), [open, setOpen] = useState(false);
  useEffect(() => { api('/auth/me').then(setUser).catch(() => setUser(null)); }, []);
  const loadNotes = useCallback(async () => {
    const n = await api('/notifications').catch(() => null); if (!n) return;
    setNotes(n);
    if ('Notification' in window && Notification.permission === 'granted') {
      const seen = JSON.parse(localStorage.getItem('shown') || '[]');
      n.filter(x => !x.read && !seen.includes(x.id)).forEach(x => new Notification('StudyMate', { body: x.message }));
      localStorage.setItem('shown', JSON.stringify([...new Set([...seen, ...n.map(x => x.id)])].slice(-200)));
    }
  }, []);
  useEffect(() => { if (!user) return; if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); loadNotes(); const i = setInterval(loadNotes, 30000); return () => clearInterval(i); }, [user, loadNotes]);
  if (user === undefined) return <p className="p-8 animate-pulse">Loading…</p>;
  if (!user) return <Auth onAuth={setUser} />;
  const unread = notes.filter(n => !n.read).length;
  const nav = [['dash', 'Dashboard', LayoutDashboard], ['asg', 'Assignments', ListTodo], ['note', `Notifications${unread ? ` (${unread})` : ''}`, Bell], ['ai', 'AI Assistant', Sparkles]];
  return (
    <div className="md:flex min-h-screen">
      <header className="md:hidden flex items-center justify-between p-3"><b>StudyMate</b><button aria-label="Menu" onClick={() => setOpen(!open)}><Menu /></button></header>
      <nav className={`${open ? 'block' : 'hidden'} md:block glass m-2 p-3 md:w-56 space-y-1 md:min-h-[calc(100vh-1rem)]`}>
        <p className="hidden md:block text-xl font-bold mb-3">StudyMate</p>
        {nav.map(([k, l, Icon]) => <button key={k} onClick={() => { setPage(k); setOpen(false); }} className={`flex w-full items-center gap-2 p-2 rounded-lg ${page === k ? 'bg-white/15' : ''}`}><Icon size={18} />{l}</button>)}
        <button onClick={() => { localStorage.removeItem('t'); setUser(null); }} className="flex w-full items-center gap-2 p-2 opacity-70"><LogOut size={18} />Log out ({user.name})</button>
      </nav>
      <main className="flex-1 p-3 md:p-6 min-w-0">
        {page === 'dash' && <Dashboard />}{page === 'asg' && <Assignments />}{page === 'note' && <Notifications items={notes} reload={loadNotes} />}{page === 'ai' && <AI />}
      </main>
    </div>);
}
