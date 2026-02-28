# Meridian — Technical Debt & Outstanding TODOs

Items here are confirmed gaps that are out of scope for the current task but must not be forgotten.
Each entry includes the file, the exact location, and what needs to happen.

---

## Git Analytics

### 1. `matchesPathPattern` is a stub — path filter does nothing

**File:** `src/domains/git/analytics-service.ts:234`

```typescript
private matchesPathPattern(_commit: CommitMetric, _pattern: string): boolean {
  return true; // TODO: implement path filtering
}
```

The `pathPattern` option in `AnalyticsOptions` is accepted by the API but silently ignored.
Commits are never filtered by path — the filter dropdown in the UI has no effect on file-level results.

**What needs to happen:** Iterate `commit.files` and return `true` if any `CommitFileChange.path`
matches the pattern via `micromatch.isMatch`. The existing `micromatch` import is already available.

---

### 2. Trend normalization uses a fixed divisor instead of actual period length

**File:** `src/domains/git/analytics-service.ts:346` / `src/constants.ts` (`ANALYTICS_SETTINGS.TREND_NORMALIZE_WEEKS`)

The commit trend splits commits into two halves and divides each by a fixed `4` (weeks) to get a
per-week rate. This is period-agnostic — a 3-month period (13 weeks/half) and a 12-month period
(26 weeks/half) both divide by 4. The slope comparison is internally consistent but the absolute
values are meaningless, and thresholds tuned for one period will be wrong for another.

**What needs to happen:** Compute the actual number of weeks in each half from the `since`/`until`
dates and pass that as the divisor. Or switch to a per-commit velocity model.

---

### 3. `getWeekKey` uses week-of-month, not ISO week — commit frequency chart bucketing is wrong

**File:** `src/domains/git/analytics-service.ts:448`

```typescript
private getWeekKey(date: Date): string {
  const d = new Date(date);
  const week = Math.ceil(d.getDate() / 7); // ← week-of-month, not calendar week
  return `${d.getFullYear()}-W${week.toString().padStart(2, "0")}`;
}
```

`Math.ceil(date.getDate() / 7)` produces 1–5 (week within the month). Two commits in different
months that fall in the same ISO calendar week get different bucket keys, fragmenting the frequency
chart unnecessarily. A commit on Jan 29 and one on Feb 1 should be in the same week bucket.

**What needs to happen:** Use ISO week number. Standard approach:

```typescript
private getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week.toString().padStart(2, "0")}`;
}
```
