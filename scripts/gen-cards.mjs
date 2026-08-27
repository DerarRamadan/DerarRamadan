#!/usr/bin/env node
/**
 * gen-cards.mjs — self-hosted GitHub profile stat cards for DerarRamadan.
 * Replaces flaky third-party services (github-readme-stats / streak-stats)
 * with locally generated SVGs in the Atelier Zero palette.
 *
 * Runs anywhere Node 20+ exists. Locally: GH_TOKEN env. CI: GITHUB_TOKEN env.
 * Output: ./dist/stats.svg, ./dist/top-langs.svg, ./dist/streak.svg
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const USER = process.env.STAT_USER || 'DerarRamadan';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const OUT = process.env.STAT_OUT || 'dist';

// Atelier Zero tokens
const C = {
  paper: '#F5F2EB', ink: '#1E1E1E', mute: '#6B655C',
  faint: '#8C857B', coral: '#C85A32', line: '#E2DDD5', soft: '#A04020',
};
const FONT = `'Segoe UI', -apple-system, BlinkMacSystemFont, 'Inter', Arial, sans-serif`;

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'derar-profile-cards',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} on ${url}`);
  return res.json();
}

const gql = (query) =>
  api('https://api.github.com/graphql', { method: 'POST', body: JSON.stringify({ query }) });

/* ---------------- data ---------------- */

const gqlRes = await gql(`{
  user(login: "${USER}") {
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
      totalCount
      nodes { name stargazerCount }
    }
  }
}`);

if (gqlRes.errors) throw new Error(JSON.stringify(gqlRes.errors));
const u = gqlRes.data.user;
const cc = u.contributionsCollection;
const days = cc.contributionCalendar.weeks
  .flatMap((w) => w.contributionDays)
  .sort((a, b) => (a.date < b.date ? -1 : 1));

const stars = u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);
const repoCount = u.repositories.totalCount;

// languages
const repos = await api(`https://api.github.com/users/${USER}/repos?per_page=100&type=owner`);
const langBytes = {};
for (const r of repos.filter((r) => !r.fork)) {
  const l = await api(`https://api.github.com/repos/${USER}/${r.name}/languages`);
  for (const [k, v] of Object.entries(l)) langBytes[k] = (langBytes[k] || 0) + v;
}
const totalBytes = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
const langs = Object.entries(langBytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([name, b]) => ({ name, pct: (b / totalBytes) * 100 }));

// streaks
const today = new Date().toISOString().slice(0, 10);
let longest = 0;
let run = 0;
for (const d of days) {
  run = d.contributionCount > 0 ? run + 1 : 0;
  if (run > longest) longest = run;
}
let i = days.length - 1;
if (days[i]?.date === today && days[i]?.contributionCount === 0) i--; // today not over yet
let current = 0;
while (i >= 0 && days[i].contributionCount > 0) { current++; i--; }

console.log(
  `contribs(last yr): ${cc.contributionCalendar.totalContributions} | repos: ${repoCount} | stars: ${stars} | streaks: ${current}/${longest} | langs: ${langs.map((l) => l.name).join(', ')}`
);

/* ---------------- svg helpers ---------------- */

const card = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="6" fill="${C.paper}" stroke="${C.line}"/>
${body}
</svg>`;

const title = (text) =>
  `  <text x="25" y="34" font-family="${FONT}" font-size="18" font-weight="700" fill="${C.coral}">${text}</text>`;
const num = (x, y, v) =>
  `  <text x="${x}" y="${y}" font-family="${FONT}" font-size="26" font-weight="800" fill="${C.ink}">${v}</text>`;
const label = (x, y, v) =>
  `  <text x="${x}" y="${y}" font-family="${FONT}" font-size="12" fill="${C.mute}">${v}</text>`;

const fmt = (n) => n.toLocaleString('en-US');

/* ---------------- stats card ---------------- */

const statsBody = [
  title("Derar Ramadan's GitHub Stats"),
  num(25, 88, fmt(cc.contributionCalendar.totalContributions)), label(25, 106, 'Total Contributions (last year)'),
  num(258, 88, fmt(cc.totalCommitContributions)), label(258, 106, 'Total Commits (last year)'),
  num(25, 152, fmt(repoCount)), label(25, 170, 'Public Repositories'),
  num(258, 152, fmt(stars)), label(258, 170, 'Total Stars Earned'),
].join('\n');
const statsSvg = card(495, 195, statsBody);

/* ---------------- top languages card ---------------- */

const barW = 300;
const langRows = langs
  .map((l, k) => {
    const y = 62 + k * 26;
    return [
      `  <text x="25" y="${y + 12}" font-family="${FONT}" font-size="13" font-weight="600" fill="${C.ink}">${l.name}</text>`,
      `  <rect x="150" y="${y}" width="${barW}" height="9" rx="4.5" fill="${C.line}"/>`,
      `  <rect x="150" y="${y}" width="${Math.max(9, Math.round((l.pct / 100) * barW))}" height="9" rx="4.5" fill="${C.coral}"/>`,
      `  <text x="470" y="${y + 9}" font-family="${FONT}" font-size="12" fill="${C.mute}" text-anchor="end">${l.pct.toFixed(1)}%</text>`,
    ].join('\n');
  })
  .join('\n');
const langsSvg = card(495, 195, [title('Most Used Languages'), langRows].join('\n'));

/* ---------------- streak card ---------------- */

const streakBody = [
  title('GitHub Streak Stats'),
  // total
  num(25, 108, fmt(cc.contributionCalendar.totalContributions)), label(25, 128, 'Total Contributions'),
  label(25, 146, `${days[0].date} — present`),
  // current (coral ring)
  `  <circle cx="260" cy="105" r="44" fill="none" stroke="${C.coral}" stroke-width="3"/>`,
  `  <text x="260" y="113" font-family="${FONT}" font-size="26" font-weight="800" fill="${C.ink}" text-anchor="middle">${current}</text>`,
  `  <text x="260" y="165" font-family="${FONT}" font-size="12" fill="${C.mute}" text-anchor="middle">Current Streak (days)</text>`,
  // longest
  num(395, 108, fmt(longest)), label(395, 128, 'Longest Streak'),
  label(395, 146, 'consecutive days'),
].join('\n');
const streakSvg = card(495, 195, streakBody);

/* ---------------- write ---------------- */

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'stats.svg'), statsSvg);
writeFileSync(join(OUT, 'top-langs.svg'), langsSvg);
writeFileSync(join(OUT, 'streak.svg'), streakSvg);
console.log(`wrote ${OUT}/stats.svg, ${OUT}/top-langs.svg, ${OUT}/streak.svg`);
