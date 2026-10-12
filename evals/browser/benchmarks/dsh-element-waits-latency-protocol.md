# Static-form latency investigation

This protocol is fixed before collecting the follow-up data. Historical cohorts
remain separate. Main is pinned to `63c16570ae4d6be54df386098ed14119cc3115b8`;
the previous arm is the packaged plugin from `fc90f150` (runtime `98f1b991`).
Only the candidate's always-present element-wait descriptions are shortened.
Execution, recovery semantics and detailed guidance stay the same.

## Design

1. Diagnostic cohort: six static-form rounds, each running main, previous and
   candidate once. Rotate and reverse their order so every permutation occurs.
   Compare task time, HTTP time, tool time, model requests, input/output tokens,
   extra reference reads and extra observations. This is exploratory evidence;
   it cannot pass the release gate.
2. Independent confirmation: 40 paired static-form rounds on main and candidate,
   alternating the first arm. Fix the candidate before starting. No optional
   stopping, dropped outliers, deducted browser time or pooling with the
   diagnostic/historical cohorts.
3. Dynamic compatibility: six pairs each for results and enabled, covering each
   fixture delay twice. Keep the existing prompts and server correctness oracle.
4. Recovery: three candidate trials each for timeout, unsupported command and
   stale ref. Check the intended fault occurred, the task completed, triggering
   actions were not replayed and the session was closed.

Both arms use the same real DSH model/profile, CLI, extension and isolated browser.
Credentials and model responses are not replaced. Conversations and workspaces
are fresh. Provider caching remains enabled. Startup is reported separately;
task time includes session setup, actual browser work and the final response.

## Gate and interpretation

The primary performance endpoint is the paired static-form task-time ratio.
Compute a one-sided 95% Student-t upper confidence bound on the mean paired
log(candidate/main) ratio, then exponentiate. The bound must be below 1.05.
Five percent is about 0.5 seconds on the earlier 10-second form, smaller than a
typical extra model round trip and materially below the observed 1.64-second
slowdown. Also report arithmetic means, medians, p95, paired differences and
request counts. A bounded non-inferiority result is not proof of zero overhead
or a guarantee for other models/sites.

All confirmation tasks must pass the independent correctness oracle. Static
candidate tasks must have no wait calls or tool errors. Dynamic tasks must have
no task failures or redundant processing/confirmation, and their means and
medians must not show an increase in either workload. All nine recovery trials
must exercise and recover from their intended fault. If the gate fails or is
inconclusive, keep the PR in draft; do not extend the cohort until it passes.

Break down observed latency into model HTTP, tool execution and remaining time.
HTTP time includes network/provider service and generation, so it alone does
not prove random model fluctuation. Changed descriptions can affect generation
and planning. Report their measured token cost and observed action differences;
do not assign all inference variation to either the feature or randomness.
