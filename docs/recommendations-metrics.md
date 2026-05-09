# Smart Recommendations Metrics

This dashboard spec defines MVP discovery metrics for home-screen song recommendations.

## KPI Definitions

- `impressions`: count of rows in `recommendation_impressions`.
- `plays`: count of `recommendation_interactions` with `interaction_type = play`.
- `likes`: count of `recommendation_interactions` with `interaction_type = like`.
- `saves`: count of `recommendation_interactions` with `interaction_type = save`.
- `skips`: count of `recommendation_interactions` with `interaction_type = skip`.
- `ctr`: `plays / impressions`.
- `saveRate`: `saves / impressions`.
- `skipRate`: `skips / impressions`.

Window defaults:
- Operational dashboard: trailing 24h.
- MVP decision dashboard: trailing 7d.

## Ownership

- Product owner: Discovery PM.
- Data owner: Desktop analytics maintainer.
- Engineering owner: Main-process IPC + recommendations service owner.

## Guardrail Targets

- `skipRate` should not exceed baseline home-surface skip rate by more than 10%.
- `saveRate` should trend positive week-over-week after rollout stage increases.
- Recommendation fetch should remain under 150ms p95 on local DB.

## Rollout Checkpoints

- Stage 1 (5%): verify no regressions in crash rate and skipRate.
- Stage 2 (25%): verify positive saveRate trend for at least 3 consecutive days.
- Stage 3 (50%): verify stable CTR and no latency regressions.
- Stage 4 (100%): ship as default; continue weekly quality audits.
