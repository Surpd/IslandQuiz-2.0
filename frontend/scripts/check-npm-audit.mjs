import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? process.env.ComSpec : "npm";
const npmArgs = isWindows
  ? ["/d", "/s", "/c", "npm.cmd audit --omit=dev --json"]
  : ["audit", "--omit=dev", "--json"];
const audit = spawnSync(npmCommand, npmArgs, {
  encoding: "utf8",
});

const output = audit.stdout ?? "";
const jsonStart = output.indexOf("{");
if (jsonStart < 0) {
  console.error("npm audit did not return a JSON report.");
  if (audit.stderr) console.error(audit.stderr.trim());
  process.exit(audit.status || 1);
}

let report;
try {
  report = JSON.parse(output.slice(jsonStart));
} catch (error) {
  console.error("Unable to parse npm audit JSON:", error.message);
  process.exit(1);
}

const allowedXlsxSources = new Map([
  [1108110, "GHSA-4r6h-8v6p-xvw6 — Prototype Pollution in sheetJS"],
  [1108111, "GHSA-5pgg-2g8v-p4x9 — SheetJS ReDoS"],
]);
const failures = [];
const accepted = [];

for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
  const isAcceptedXlsx =
    name === "xlsx" &&
    vulnerability.fixAvailable === false &&
    via.length > 0 &&
    via.every(
      (advisory) =>
        advisory.severity === "high" &&
        allowedXlsxSources.has(advisory.source) &&
        advisory.name === "xlsx",
    );

  if (isAcceptedXlsx) {
    for (const advisory of via) {
      accepted.push(allowedXlsxSources.get(advisory.source));
    }
  } else {
    failures.push({ name, severity: vulnerability.severity, via, fixAvailable: vulnerability.fixAvailable });
  }
}

for (const advisory of accepted) {
  console.warn(`Accepted temporary xlsx risk (no upstream fix): ${advisory}`);
}

if (failures.length > 0) {
  console.error("npm audit found non-allowlisted vulnerabilities:");
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("npm audit passed: no non-allowlisted production vulnerabilities.");
