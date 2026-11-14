const WEIGHT = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function ruleBasedPlan(items) {
  const sorted = [...items].sort((a, b) => a.deadline - b.deadline || WEIGHT[a.priority] - WEIGHT[b.priority]);
  const lines = sorted.map((a, i) => {
    const days = Math.max(1, Math.ceil((a.deadline - Date.now()) / 864e5));
    const parts = days > 3 ? ['Outline & research', 'Draft', 'Review & submit'] : ['Draft', 'Review & submit'];
    return `${i + 1}. ${a.title} (${a.priority}, due in ${days}d): ${parts.join(' → ')}`;
  });
  return lines.length ? lines.join('\n') : 'No open assignments. Nothing to plan.';
}

export async function buildPlan(items) {
  if (process.env.ANTHROPIC_API_KEY && items.length) {
    try {
      const brief = items.map(a => `${a.title} | ${a.priority} | due ${a.deadline.toISOString()} | ${(a.description || '').slice(0, 300)}`).join('\n');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000,
          messages: [{ role: 'user', content: `Make a prioritized study schedule, breaking big assignments into small tasks:\n${brief}` }] }),
      });
      if (r.ok) return { source: 'ai', plan: (await r.json()).content.map(c => c.text || '').join('') };
    } catch { /* fall through */ }
  }
  return { source: 'rule-based', plan: ruleBasedPlan(items) };
}
