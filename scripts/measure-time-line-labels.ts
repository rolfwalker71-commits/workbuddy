/**
 * Zeitmessung für die Stundenliste, ohne Browser und ohne Anmeldung.
 *
 * Fährt genau den Pfad, den /api/maringo/timekeeping/day und
 * /api/maringo/timekeeping/line-labels fahren, zweimal hintereinander — der
 * erste Durchgang füllt den Zeilen-Cache, der zweite zeigt, was er bringt.
 *
 *   node --env-file=.env --import tsx scripts/measure-time-line-labels.ts [YYYY-MM-DD]
 */
import { runWithMariUser } from "../lib/mari/request-context";
import {
  enrichTimeLineContractLabels,
  listTimeLinesForDay,
} from "../lib/mari/timekeeping";
import type { MariTimePeriod } from "../lib/mari/timekeeping-shared";
import { getDb } from "../lib/db/client";

const PERIODS: MariTimePeriod[] = ["day", "week", "month"];

function userWithEmployeeNumber(): number {
  const row = getDb()
    .prepare(
      `SELECT id FROM users
       WHERE mari_employee_number IS NOT NULL AND TRIM(mari_employee_number) != ''
       ORDER BY id LIMIT 1`
    )
    .get() as { id: number } | undefined;
  if (!row) throw new Error("Kein User mit Personalnummer in der DB.");
  return row.id;
}

async function measure(userId: number, date: string, period: MariTimePeriod) {
  const t0 = Date.now();
  const summary = await runWithMariUser(userId, () =>
    listTimeLinesForDay({ dateYmd: date, period })
  );
  const dayMs = Date.now() - t0;

  const t1 = Date.now();
  const labels = await runWithMariUser(userId, () =>
    enrichTimeLineContractLabels(
      summary.lines
        .filter((l) => l.lineId > 0)
        .map((l) => ({
          lineId: l.lineId,
          projectNumber: l.projectNumber,
          projectCustomer: l.projectCustomer,
          contractId: l.contractId,
          contractNumber: l.contractNumber,
          contractName: l.contractName,
          contractPositionId: l.contractPositionId,
          contractPositionNumber: l.contractPositionNumber,
          contractPositionName: l.contractPositionName,
        }))
    )
  );
  const labelMs = Date.now() - t1;

  const withContract = labels.filter((l) => l.contractId > 0).length;
  const withPosition = labels.filter((l) => l.contractPositionName).length;
  console.log(
    `  ${period.padEnd(5)} ${String(summary.lines.length).padStart(3)} Zeilen` +
      ` · /day ${String(dayMs).padStart(5)}ms` +
      ` · labels ${String(labelMs).padStart(6)}ms` +
      ` · Vertrag ${withContract}/${labels.length}` +
      ` · Position ${withPosition}/${labels.length}`
  );
}

async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const userId = userWithEmployeeNumber();
  console.log(`user #${userId}, Anker ${date}\n`);
  for (const pass of [1, 2]) {
    console.log(`Durchgang ${pass}${pass === 1 ? " (Cache kalt)" : " (Cache warm)"}:`);
    for (const period of PERIODS) {
      await measure(userId, date, period);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
