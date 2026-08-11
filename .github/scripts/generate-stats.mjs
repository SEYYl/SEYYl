/**
 * generate-stats.mjs
 * 生成 GitHub 统计 SVG 卡片（stats-card / top-langs / achievements）
 * 产物输出到 dist/ 目录，由 workflow 推送到 output 分支，README 通过 jsDelivr 加载
 */
const GITHUB_USER = process.env.GITHUB_USER || 'SEYYl';
const TOKEN = process.env.GITHUB_TOKEN || '';

const headers = { 'User-Agent': 'stats-gen', Accept: 'application/vnd.github+json' };
if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

const COLORS = {
  Python: '#3776AB', JavaScript: '#F1E05A', TypeScript: '#3178C6',
  HTML: '#E34C26', CSS: '#563D7C', Java: '#B07219', Go: '#00ADD8',
  Rust: '#DEA584', Vue: '#41B883', PHP: '#4F5D95', 'C++': '#F34B7D',
  C: '#555555', Shell: '#89E051', Dockerfile: '#384D54', Astro: '#BC52EE',
};
const DEFAULT_COLOR = '#8B949E';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

// ---------- 数据采集 ----------
async function collect() {
  const user = await api(`/users/${GITHUB_USER}`);
  const repos = await api(`/users/${GITHUB_USER}/repos?per_page=100&sort=updated&type=public`);

  let totalStars = 0;
  let langBytes = {};
  const originals = [];
  const langPaths = repos.filter((r) => !r.fork).map((r) => `/repos/${GITHUB_USER}/${r.name}/languages`);
  // 并发拉取语言数据（每批 6 个）
  for (let i = 0; i < langPaths.length; i += 6) {
    const batch = langPaths.slice(i, i + 6);
    const results = await Promise.all(batch.map((p) => api(p).catch(() => ({}))));
    results.forEach((langs) => {
      for (const [name, bytes] of Object.entries(langs)) {
        langBytes[name] = (langBytes[name] || 0) + bytes;
      }
    });
  }
  repos.forEach((r) => {
    totalStars += r.stargazers_count;
    if (!r.fork) originals.push(r);
  });

  // 语言占比（前 6）
  const langList = Object.entries(langBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, bytes]) => ({ name, bytes, pct: bytes / Math.max(1, Object.values(langBytes).reduce((a, b) => a + b, 0)) }));

  return {
    name: user.name || user.login,
    followers: user.followers,
    repos: user.public_repos,
    stars: totalStars,
    langCount: Object.keys(langBytes).length,
    originals: originals.length,
    langList,
    updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
  };
}

// ---------- SVG 生成 ----------
const BG = '#0d1117', PANEL = '#161b22', BORDER = '#21262d';
const PURPLE = '#7C6AFF', PINK = '#FF6B6B', GREEN = '#44CC11';
const TEXT = '#f0f6fc', SUB = '#8b949e';

function svgFrame(w, h, title, subtitle) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="14" fill="${BG}" stroke="${BORDER}"/>
<text x="24" y="34" font-family="'Segoe UI',sans-serif" font-size="16" font-weight="700" fill="${PURPLE}">${esc(title)}</text>
<text x="${w - 24}" y="32" font-family="'Segoe UI',sans-serif" font-size="11" fill="${SUB}" text-anchor="end">${esc(subtitle)}</text>`;
}

// 1. 核心统计卡
function statsCard(d) {
  const w = 440, h = 200;
  const cells = [
    { label: '👥 关注者', value: fmt(d.followers), color: PURPLE, icon: 'people' },
    { label: '⭐ 总获星', value: fmt(d.stars), color: PINK, icon: 'star' },
    { label: '📦 公开仓库', value: fmt(d.repos), color: GREEN, icon: 'repo' },
    { label: '🗂️ 语言数', value: fmt(d.langCount), color: '#58A6FF', icon: 'lang' },
  ];
  let body = '';
  cells.forEach((c, i) => {
    const x = 24 + (i % 2) * 208, y = 56 + Math.floor(i / 2) * 68;
    body += `<rect x="${x}" y="${y}" width="192" height="56" rx="10" fill="${PANEL}"/>
<text x="${x + 14}" y="${y + 24}" font-family="'Segoe UI',sans-serif" font-size="12" fill="${SUB}">${esc(c.label)}</text>
<text x="${x + 14}" y="${y + 47}" font-family="'Segoe UI',sans-serif" font-size="22" font-weight="700" fill="${esc(c.color)}">${esc(c.value)}</text>`;
  });
  return `${svgFrame(w, h, '📊 GitHub 数据', '实时统计 · ' + d.updatedAt)}${body}
<text x="24" y="${h - 12}" font-family="'Segoe UI',sans-serif" font-size="10" fill="${SUB}">${esc(d.name)} · 数据来自 GitHub API</text>
</svg>`;
}

// 2. 语言占比
function topLangsCard(d) {
  const rows = d.langList;
  const h = 90 + rows.length * 30;
  let body = '';
  rows.forEach((r, i) => {
    const y = 58 + i * 30;
    const barW = 292 * Math.max(0.04, r.pct);
    body += `<text x="24" y="${y}" font-family="'Segoe UI',sans-serif" font-size="13" fill="${TEXT}">${esc(r.name)}</text>
<rect x="110" y="${y - 11}" width="292" height="12" rx="6" fill="${PANEL}"/>
<rect x="110" y="${y - 11}" width="${barW.toFixed(1)}" height="12" rx="6" fill="${esc(COLORS[r.name] || DEFAULT_COLOR)}"/>
<text x="418" y="${y}" font-family="'Segoe UI',sans-serif" font-size="13" font-weight="600" fill="${SUB}" text-anchor="end">${(r.pct * 100).toFixed(1)}%</text>`;
  });
  return `${svgFrame(440, h, '🗂️ 常用语言', '按仓库代码量')}${body}
</svg>`;
}

// 3. 里程碑（奖杯墙替代）
function achievementsCard(d) {
  const w = 440, h = 170;
  const items = [
    { label: '⭐ 获得星星', cur: d.stars, goal: 100, color: PINK },
    { label: '👥 粉丝数量', cur: d.followers, goal: 50, color: PURPLE },
    { label: '🚀 原创项目', cur: d.originals, goal: 10, color: GREEN },
  ];
  let body = '';
  items.forEach((it, i) => {
    const y = 62 + i * 36;
    const pct = Math.min(1, it.cur / it.goal);
    const barW = 320 * Math.max(0.04, pct);
    body += `<text x="24" y="${y}" font-family="'Segoe UI',sans-serif" font-size="12.5" fill="${SUB}">${esc(it.label)}</text>
<rect x="118" y="${y - 10}" width="280" height="13" rx="6.5" fill="${PANEL}"/>
<rect x="118" y="${y - 10}" width="${barW.toFixed(1)}" height="13" rx="6.5" fill="${esc(it.color)}"/>
<text x="${w - 24}" y="${y}" font-family="'Segoe UI',sans-serif" font-size="12.5" font-weight="600" fill="${TEXT}" text-anchor="end">${esc(fmt(it.cur))} / ${it.goal}</text>`;
  });
  return `${svgFrame(w, h, '🏆 里程碑', '持续前行中')}${body}
</svg>`;
}

// ---------- 主流程 ----------
const { mkdir, writeFile } = await import('node:fs/promises');
const d = await collect();
await mkdir('dist', { recursive: true });
await Promise.all([
  writeFile('dist/stats-card.svg', statsCard(d), 'utf8'),
  writeFile('dist/top-langs.svg', topLangsCard(d), 'utf8'),
  writeFile('dist/achievements.svg', achievementsCard(d), 'utf8'),
]);
console.log(`✅ 生成完成: 关注者=${d.followers} 星星=${d.stars} 仓库=${d.repos} 语言=${d.langCount} 原创=${d.originals}`);
console.log(`   语言: ${d.langList.map((l) => `${l.name} ${(l.pct * 100).toFixed(0)}%`).join(', ')}`);
