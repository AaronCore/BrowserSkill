# Follow-up: ordinary-form latency

**The overall gate did not pass; #414 remains a draft.** The corrected version
passed the ordinary-form gate (40 pairs, upper latency-ratio bound 1.0282 < 1.05)
and all 113 final-version tasks completed, including nine fault-recovery trials.
However, the visible-but-disabled-button workload became slower in both mean and
median. Functional completion is not evidence that all task paths became faster.
The thresholds and sample counts were not relaxed after seeing the results.

## Where the earlier 1.64 seconds went

Re-examining the three-pair current-main cohort in the original report gives:

| Mean seconds | Main | Earlier candidate | Difference |
| --- | ---: | ---: | ---: |
| Complete task | 10.274 | 11.915 | +1.641 |
| Model HTTP | 8.334 | 9.756 | +1.423 |
| Tool execution | 1.720 | 1.925 | +0.205 |

No candidate task invoked an element wait. One read the interaction reference in
the same model round as session startup; this was not an extra model request.
Another added an observation round before submitting. The third had the same
operation sequence and request count as main but longer model responses. One
pair also had a roughly 0.5-second navigation-time difference; similar navigation
variation occurred in main. Mean output tokens were 882 versus 1123.

Most of the difference was in the model phase, which includes provider/network
time and generation. It cannot all be labeled random model noise: new descriptions
can change planning, generated tokens and reference loading. Conversely, these
records cannot assign an exact causal share to instructions versus provider
variation. The new action does not add polling or browser commands to existing
operation handlers.

## Changes and exploratory checks

- Shorten duplicated wait descriptions while retaining observed-condition use,
  CSS/ref restrictions, timeout semantics and visibility-versus-enabled guidance.
- Restore main's ordinary skill entry exactly. The wait contract is available in
  its action/parameter schema; detailed examples and recovery guidance remain in
  the interaction reference. Ordinary tasks gain no new mandatory reference trigger.
- Normalize the benchmark's model-visible plugin path and use opaque workspace
  IDs. Earlier runs exposed different checkout/arm names. The package is copied
  before timing into one experiment-owned location between exited DSH processes;
  both arms use the same dependencies. Historical results remain separate.

The six-round diagnostic compared main, the previous packaged PR and a trim-only
candidate. Their means were 17.066, 18.470 and 19.744 seconds; all 18 passed. Tool
means were 6.849, 6.843 and 6.756 seconds. Shortening descriptions alone did not
help: the trim-only arm read the interaction reference in 3/6 tasks and averaged
10.5 model requests, versus main's 9.0. Keep this unfavorable result.

A further six exploratory pairs compared trim-only with the restored entry:
12.419 versus 12.481 seconds, all 12 passed. This did not establish an improvement.
Neither exploratory cohort used the later path normalization, and neither is
pooled with confirmation or used to pass the gate.

## First independent confirmation

All 80 tasks completed, but the upper latency-ratio bound was 1.0517, above 1.05.
That result was inconclusive for non-inferiority, not proof of a significant
slowdown. It remains reported separately from the later corrected version.

The [protocol](dsh-element-waits-latency-protocol.md) fixed 40 paired static-form
rounds and a one-sided 95% Student-t bound on the mean log(candidate/main) ratio.
Five percent was chosen before measurement, below the earlier observed slowdown
and smaller than a typical additional model round trip on the earlier form.

Baseline: main `63c16570ae4d6be54df386098ed14119cc3115b8`. Candidate runtime:
`fab39d50`; runner: `636f0cce`. Both arms used DSH 0.2.0-rc.2, the configured
`deepseek-official / deepseek-flash` with high reasoning, the same release CLI,
daemon, extension and isolated headless Chrome for Testing. Prompts, fixture and success
oracle are unchanged. Arm order alternates; all completed samples are retained.
The model chooses its plan and tool calls. No inference or response is simulated.

| Ordinary form, 40 trials per arm | Main | Candidate |
| --- | ---: | ---: |
| Correct completion | 40/40 | 40/40 |
| Mean task seconds | 18.766 | 19.060 |
| Median task seconds | 18.304 | 18.488 |
| p95 task seconds | 22.268 | 24.080 |
| Mean model HTTP seconds | 11.739 | 12.151 |
| Mean tool seconds | 6.780 | 6.657 |
| Total actual model requests | 379 | 389 |
| Mean generated tokens | 955.4 | 965.1 |
| Mean input tokens after skill loading | 11470.5 | 11644.9 |
| Element waits / tool errors | 0 / 0 | 0 / 0 |

The mean difference is +0.294 seconds; the mean paired geometric ratio is 1.0165
and its upper confidence bound is 1.0517. The median paired difference is +0.545
seconds, which differs from subtracting group medians. All 768 model HTTP requests
returned 200 and matched persisted DSH assistant attempts. An independent Python
calculation reproduced the JavaScript confidence bound.

There is a small real context cost: about 174 extra input tokens, or 1.52%, in the
first request after skill loading. The candidate also used ten more model requests
overall. No reference preloads occurred in either arm. Main performed 89 ordinary
observations and the candidate 88. Main combined initial navigation with session
startup in three tasks; the candidate always navigated separately. One candidate
task unnecessarily checked its shell with `date; echo ok`; it remains included.
Action grouping varies, so the request difference is not evidence of an inserted
adapter wait or a compulsory extra observation on every task.

Mean model HTTP time increased by 0.413 seconds while tool time decreased by 0.123
seconds. All 80 native clicks took about 5.15–5.20 seconds in both arms, compared
with roughly 0.17 seconds in some earlier cohorts. This shared browser timing
change is not caused solely by the new DSH action. Its precise cause remains
unresolved; a separate CDP instrumentation probe did not produce usable data and
is not included in any acceptance cohort. No browser time is subtracted. Absolute
times across different dates/browser runs must not be treated as an optimization
speedup.

## Dynamic guidance regression and correction

The first candidate also completed all 24 dynamic tasks, but did not pass the
predeclared mean/median screening:

| Scenario, six trials per arm | Mean seconds, main → candidate | Median seconds, main → candidate | Actual model requests, main → candidate |
| --- | ---: | ---: | ---: |
| Results appear | 36.800 → 39.805 | 33.054 → 31.353 | 83 → 89 |
| Visible but disabled button | 32.425 → 30.970 | 30.864 → 32.723 | 83 → 85 |

Candidate tasks invoked five element waits in twelve tasks, all satisfied. However,
some pending updates were handled with sleeps, lifecycle waits or repeated HTML
inspection. For example, results round 2 and enabled round 2 both observed the
fresh `@e2` processing indicator, but used other waiting paths. The shortened
description had removed the dynamic-versus-lifecycle distinction and ref preference.
Removing important guidance to save context did not produce an acceptable result.

Candidate results round 1 included a 30-second screenshot timeout and recovered.
Main results round 4 recovered from an invalid ref argument; main enabled round 5
recovered from an incorrect session ID rejected by ownership validation. All are
included. No processing or successful confirmation was duplicated. Recovery-only
trials were not run on this rejected instruction version.

Revision `7702eadb` restores two decisions in the action schema: use element
conditions for observed pending dynamic updates instead of sleeps/lifecycle waits
or repeated polling, and prefer an existing fresh ref over fetching HTML for a
selector. It removes the redundant action-name list, already present in the enum.
Main's skill entry and all execution code stay unchanged. This revision gets its
own fixed-size confirmation, dynamic and recovery cohorts under the same gate;
earlier samples cannot qualify it for release.

## Corrected version: independent ordinary-form confirmation

The frozen `7702eadb` runtime completed another 40 independent pairs. These
samples are separate from the rejected candidate and use the same 5% gate.

| Ordinary form, 40 trials per arm | Main | Corrected candidate |
| --- | ---: | ---: |
| Correct completion | 40/40 | 40/40 |
| Mean task seconds | 12.380 | 12.243 |
| Median task seconds | 12.157 | 11.657 |
| p95 task seconds | 15.843 | 15.625 |
| Mean model HTTP seconds | 10.302 | 10.160 |
| Mean tool seconds | 1.844 | 1.848 |
| Total actual model requests | 390 | 386 |
| Mean generated tokens | 958.5 | 965.8 |
| Mean input tokens after skill loading | 11472.7 | 11652.5 |
| Element waits / tool errors | 0 / 0 | 0 / 0 |

The mean paired difference is −0.138 seconds, the geometric mean ratio is 0.9855,
and its one-sided 95% upper bound is 1.0282, below 1.05. The median paired
difference is −0.583 seconds. All 776 HTTP requests returned 200 and matched
persisted attempts. This satisfies the predefined ordinary-form gate; it does
not prove exactly zero cost. The new capability still adds about 180 input tokens
to the first model request after skill loading.

Both arms' native clicks returned to the faster path in this fresh browser run.
Do not attribute the change from roughly 19 seconds in the previous cohort to
roughly 12 seconds here to the guidance change. Only the within-cohort paired
comparison supports the conclusion above; no shared browser time was removed.

## Corrected version: dynamic tasks and recovery

| Scenario, six trials per arm | Mean seconds, main → candidate | Median seconds, main → candidate | Actual model requests, main → candidate |
| --- | ---: | ---: | ---: |
| Results appear | 22.253 → 20.924 | 23.437 → 20.625 | 79 → 83 |
| Visible but disabled button | 18.525 → 22.276 | 16.265 → 22.647 | 75 → 87 |

All 24 tasks passed without tool errors; all 11 element waits satisfied their
conditions. Results tasks improved in mean and median, although p95 increased
from 25.346 to 27.804 seconds. Enabled-button tasks were slower in five of six
pairs, with a mean penalty of 3.751 seconds and median paired penalty of 4.749
seconds. Their p95 decreased from 31.355 to 29.410 seconds; that does not cancel
the mean/median regression or pass the declared screening gate.

The enabled traces identify costs beyond ordinary response-time fluctuation:

- Candidate tasks made 13 HTML calls, versus none on main, while constructing or
  checking CSS conditions such as `#confirm:not([disabled])`. They made twelve
  more model requests overall. One task made six HTML calls and eighteen model
  requests, versus eleven model requests in its paired baseline.
- One candidate chose the existing lifecycle `wait` with `networkidle` and a
  15000 ms timeout; that call consumed 15.022 seconds. Another used two sleeps
  totaling about twelve seconds. The corrected description did not reliably
  prevent these choices.
- Mean model HTTP time increased from 13.040 to 15.489 seconds, and mean tool
  time from 5.150 to 6.466 seconds. This is not an inserted wait in the adapter's
  ordinary action handlers; it is additional work in the model-selected plan.

Waiting for visibility does not establish enabled state. In these tasks, finding
and choosing an appropriate condition sometimes cost more than the baseline
path. More aggressive instructions alone have not established non-regression.
Do not promote the PR based only on the ordinary-form result or the faster
results-page workload, and do not add trials to the unchanged candidate until a
favorable aggregate appears.

| Forced recovery condition | Completed | Intended fault verified |
| --- | ---: | --- |
| First wait limited to 100 ms | 3/3 | `satisfied=false` in all three |
| CLI rejects the new command | 3/3 | Unsupported-command error in all three |
| Navigation invalidates the observed ref | 3/3 | Stale node/ref error in all three |

Every recovery task observed before its next click, started processing once,
confirmed once and stopped its session. One unsupported-command task first used
a lifecycle wait before observing; do not describe it as immediate inspection.
All 120 recovery HTTP requests were measured and matched persisted attempts.
Together with 776 static and 324 dynamic requests, the final runtime completed
113 tasks using 1220 verified HTTP requests. This validates completion and
single-action recovery in the tested cases, while leaving the latency gate failed.

## Repository validation

Repository lint and type checking passed, including all 494 DSH tests. All 13
Node script tests (including LF/CRLF budgets), 15 evaluation-framework tests and
corpus validation passed. The Node 22 package check verified all seven skill
resources outside the repository. The packaged runtime hash still matches the
artifact used for all three final-version cohorts. The skill entry is identical
to main: 4404 bytes with LF and 4485 with CRLF.

## Evidence and reproduction

[Per-task metrics](data/dsh-element-waits-latency.csv),
[per-request timings and next tool names](data/dsh-element-waits-latency-steps.csv),
and [version hashes and summaries](data/dsh-element-waits-latency-evidence.json)
contain sanitized measurements, not raw prompts, model reasoning or credentials.
The first cohort in these files is the six historical static trials used for
the earlier slowdown breakdown; the other historical workloads remain in the
[original report](dsh-element-waits.md).

Recompute the fixed-size primary comparison from the public CSV:

```sh
node evals/browser/benchmarks/dsh-element-waits-latency-summary.mjs
```

Select the corrected runtime's independent confirmation explicitly:

```sh
node evals/browser/benchmarks/dsh-element-waits-latency-summary.mjs \
  evals/browser/benchmarks/data/dsh-element-waits-latency.csv \
  latency-revised-confirmation
```

The benchmark accepts `--previous` with `--modes main,previous,candidate` for the
balanced diagnostic and `--candidate` to select another packaged candidate. For
confirmation use `--cases static --samples 40` with the baseline and isolated
Chrome/CLI arguments documented in the original report. Use a fresh output
directory for every cohort. A single model and local fixtures cannot establish
zero overhead or a guarantee for all sites. More measurements on the unchanged
candidate were not added to force this confidence bound below the gate.
