import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// The sanitized export contains only comma-free scalar fields, not transcripts.
const csv = await readFile(
  process.argv[2] ?? new URL("./data/dsh-element-waits-latency.csv", import.meta.url),
  "utf8",
);
const [header, ...lines] = csv.trim().split(/\r?\n/);
const keys = header.split(",");
const rows = lines.map((line) => {
  const fields = line.split(",");
  assert.equal(fields.length, keys.length);
  return Object.fromEntries(keys.map((key, i) => [key, fields[i]]));
});
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: values.length,
    mean: mean(values),
    median:
      (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}
const groups = {};
for (const row of rows) {
  const key = `${row.cohort}/${row.scenario}/${row.mode}`;
  (groups[key] ??= []).push(row);
}
const summaries = Object.fromEntries(
  Object.entries(groups).map(([key, group]) => [
    key,
    {
      ...Object.fromEntries(
        ["taskMs", "modelMs", "toolMs", "modelCalls", "outputTokens", "loadedInputTokens"].map(
          (metric) => [metric, stats(group.map((row) => Number(row[metric])))],
        ),
      ),
      passed: group.filter((row) => row.success === "true").length,
      toolErrors: group.reduce((sum, row) => sum + Number(row.toolErrors), 0),
      waitCalls: group.reduce((sum, row) => sum + Number(row.waitCalls), 0),
    },
  ]),
);
const cohort = process.argv[3] ?? "latency-confirmation";
const baseline = groups[`${cohort}/static/main`];
const candidate = groups[`${cohort}/static/candidate`];
assert.equal(baseline?.length, 40, "The predeclared confirmation requires 40 complete pairs");
assert.equal(candidate?.length, 40);
assert.equal(new Set(baseline.map((row) => row.round)).size, 40);
assert.equal(new Set(candidate.map((row) => row.round)).size, 40);
const differences = [];
const logs = candidate.map((row) => {
  const control = baseline.find((item) => item.round === row.round);
  assert(control, `Missing control for round ${row.round}`);
  for (const sample of [row, control]) {
    assert.equal(sample.measurementValid, "true");
    assert.equal(sample.allHttp200, "true");
    assert(Number(sample.taskMs) > 0);
  }
  differences.push(Number(row.taskMs) - Number(control.taskMs));
  return Math.log(Number(row.taskMs) / Number(control.taskMs));
});
const average = mean(logs);
const deviation = Math.sqrt(logs.reduce((sum, value) => sum + (value - average) ** 2, 0) / 39);
// One-sided t(39) quantile at 0.95, fixed by the 40-pair protocol.
const upper95Ratio = Math.exp(average + (1.684875121711225 * deviation) / Math.sqrt(40));
const prefix = cohort.replace(/confirmation$/, "");
const completed = (group, size) =>
  group?.length === size &&
  group.every(
    (row) =>
      row.success === "true" &&
      row.measurementValid === "true" &&
      row.allHttp200 === "true" &&
      row.starts === "1" &&
      row.confirmations === "1" &&
      row.stopped === "true",
  );
const dynamicScreening = Object.fromEntries(
  ["results", "enabled"].map((scenario) => {
    const key = `${prefix}dynamic/${scenario}`;
    const control = summaries[`${key}/main`];
    const treatment = summaries[`${key}/candidate`];
    return [
      scenario,
      {
        complete: completed(groups[`${key}/main`], 6) && completed(groups[`${key}/candidate`], 6),
        meanPassed: Boolean(control && treatment && treatment.taskMs.mean <= control.taskMs.mean),
        medianPassed: Boolean(
          control && treatment && treatment.taskMs.median <= control.taskMs.median,
        ),
      },
    ];
  }),
);
const recoveryGate = ["timeout", "unsupported", "stale"].every((scenario) => {
  const group = groups[`${prefix}recovery/${scenario}/candidate`];
  return (
    completed(group, 3) &&
    group.every((row) => Number(row.faults) >= 1 && row.observedBeforeRecoveryClick === "true")
  );
});
const correctnessGate = [...baseline, ...candidate].every((row) => row.success === "true");
const ordinaryPathGate = candidate.every((row) => row.waitCalls === "0" && row.toolErrors === "0");
console.log(
  JSON.stringify(
    {
      groups: summaries,
      staticConfirmation: {
        cohort,
        geometricRatio: Math.exp(average),
        upper95Ratio,
        performanceGate: upper95Ratio < 1.05,
        correctnessGate,
        ordinaryPathGate,
        pairedDifferenceMs: stats(differences),
      },
      dynamicScreening,
      recoveryGate,
      overallGate:
        upper95Ratio < 1.05 &&
        correctnessGate &&
        ordinaryPathGate &&
        Object.values(dynamicScreening).every(
          (result) => result.complete && result.meanPassed && result.medianPassed,
        ) &&
        recoveryGate,
    },
    null,
    2,
  ),
);
