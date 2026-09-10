/**
 * Vertrag und Vertragsposition pro Buchungszeile, lokal zwischengespeichert.
 *
 * MARI liefert diese Felder nur über `GET /api/TimeKeepingLine/{id}` — die
 * SQL-Sicht auf `MARIProjectTimeKeepingLines` enthält keine Vertragsspalten,
 * und der Endpunkt verträgt nur eine Anfrage zur Zeit (siehe den Gate in
 * `client.ts`). Ein Monat kostet damit gemessen ~7s nur für diesen Schritt.
 *
 * Die Zuordnung einer gebuchten Zeile zu Vertrag und Position ändert sich nach
 * dem Buchen praktisch nicht, darum ist sie cachebar. Wer eine Zeile über Buddy
 * ändert oder löscht, verwirft ihren Eintrag; wird in MARI direkt umgehängt,
 * zeigt Buddy den alten Wert bis zum Ablauf der TTL.
 */

import { getDb } from "@/lib/db/client";
import type { MariContractFields } from "@/lib/mari/timekeeping-shared";

/** Lang, weil sich der Vertrag einer gebuchten Zeile kaum noch ändert. */
export const TIME_LINE_LABEL_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type Row = {
  line_id: number;
  contract_id: number | null;
  contract_number: string | null;
  contract_name: string | null;
  contract_position_id: number | null;
  contract_position_number: string | null;
  contract_position_name: string | null;
  fetched_at: string;
};

function toFields(row: Row): MariContractFields {
  return {
    contractId: row.contract_id ?? 0,
    contractNumber: row.contract_number,
    contractName: row.contract_name,
    contractPositionId: row.contract_position_id ?? 0,
    contractPositionNumber: row.contract_position_number,
    contractPositionName: row.contract_position_name,
  };
}

/**
 * Cached fields per line id. Lines without an entry — or with a stale one —
 * are simply absent, so the caller knows exactly which ones still need MARI.
 */
export function readTimeLineLabels(
  lineIds: readonly number[],
  now = Date.now()
): Map<number, MariContractFields> {
  const out = new Map<number, MariContractFields>();
  const ids = [...new Set(lineIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return out;
  const db = getDb();
  const cutoff = new Date(now - TIME_LINE_LABEL_TTL_MS).toISOString();
  // Chunked so a quarter's worth of ids cannot blow the SQLite parameter limit.
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT * FROM mari_time_line_labels
         WHERE line_id IN (${placeholders}) AND fetched_at >= ?`
      )
      .all(...chunk, cutoff) as Row[];
    for (const row of rows) out.set(row.line_id, toFields(row));
  }
  return out;
}

export function writeTimeLineLabels(
  entries: ReadonlyArray<{ lineId: number } & MariContractFields>,
  now = Date.now()
): void {
  const usable = entries.filter((e) => Number.isInteger(e.lineId) && e.lineId > 0);
  if (usable.length === 0) return;
  const db = getDb();
  const at = new Date(now).toISOString();
  const stmt = db.prepare(
    `INSERT INTO mari_time_line_labels (
       line_id, contract_id, contract_number, contract_name,
       contract_position_id, contract_position_number, contract_position_name,
       fetched_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(line_id) DO UPDATE SET
       contract_id = excluded.contract_id,
       contract_number = excluded.contract_number,
       contract_name = excluded.contract_name,
       contract_position_id = excluded.contract_position_id,
       contract_position_number = excluded.contract_position_number,
       contract_position_name = excluded.contract_position_name,
       fetched_at = excluded.fetched_at`
  );
  const run = db.transaction(
    (rows: ReadonlyArray<{ lineId: number } & MariContractFields>) => {
      for (const e of rows) {
        stmt.run(
          e.lineId,
          e.contractId > 0 ? e.contractId : null,
          e.contractNumber?.trim() || null,
          e.contractName?.trim() || null,
          e.contractPositionId > 0 ? e.contractPositionId : null,
          e.contractPositionNumber?.trim() || null,
          e.contractPositionName?.trim() || null,
          at
        );
      }
    }
  );
  run(usable);
}

/** After editing, booking or deleting a line its cached labels are suspect. */
export function forgetTimeLineLabels(lineId: number): void {
  if (!Number.isInteger(lineId) || lineId <= 0) return;
  getDb().prepare(`DELETE FROM mari_time_line_labels WHERE line_id = ?`).run(lineId);
}
