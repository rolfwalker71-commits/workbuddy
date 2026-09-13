/** Reine Helfer für den Vertrags-Cache (kein Node/SQLite). */

export type MariContractRow = {
  contractId: number;
  contractNumber: string | null;
  projectNumber: string | null;
  description: string | null;
  company: number | null;
  /** MARI führt −1 als "wahr"; hier normalisiert auf 0/1. */
  inactive: boolean;
};

export type MariContractPositionRow = {
  positionId: number;
  contractId: number;
  position: string | null;
  matchcode: string | null;
  description: string | null;
  company: number | null;
  serviceNumber: string | null;
  indent: number;
  parentId: number | null;
};

/**
 * MARI kodiert Wahrheitswerte als −1, nicht als 1 — gemessen an `Inactive`
 * (−1 → 42 Verträge, 0 → 1722) und bestätigt gegen die REST-Variante
 * `/ProjectListContracts/{pn}/true`, die exakt die Zeilen mit 0 liefert.
 */
export function mariFlagIsTrue(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const n = Number(raw);
  if (Number.isFinite(n)) return n !== 0;
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "true" || s === "y" || s === "-1";
}

/**
 * Eine Position ist bebuchbar, wenn sie eine Leistungsnummer trägt.
 *
 * Gemessen gegen `/api/ContractListPositionsForTimeKeeping/{id}`: von 187
 * Positionen bot MARI genau die 48 mit gesetzter ServiceNumber an (222 Beratung,
 * 242 Reisezeit, 230/231 Zuschläge). Die zurückgehaltenen sind Lizenz-, Material-
 * und Strukturzeilen — auf die lassen sich keine Stunden buchen.
 *
 * Nicht `ActiveType` verwenden: dessen Werte −1 und 0 kommen auf beiden Seiten
 * vor, der Filter wäre in beide Richtungen falsch.
 */
export function mariPositionIsBookable(serviceNumber: unknown): boolean {
  return String(serviceNumber ?? "").trim().length > 0;
}

/**
 * Positionsnummern sortieren: "1", "1.1", "1.2", "2", "10".
 *
 * Lexikografisch käme "10" vor "2", und die Reihenfolge ist das, was der
 * Benutzer in der Buchungsmaske als Gliederung liest.
 */
export function compareMariPositionNumbers(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const segs = (v: string | null | undefined) => {
    const raw = String(v ?? "").trim();
    // Ohne Nummer ans Ende — leer als 0 zu lesen stellt die Zeile vor Position 1.
    if (!raw) return [Number.POSITIVE_INFINITY];
    return raw.split(".").map((part) => {
      const n = Number(part.trim());
      return part.trim() !== "" && Number.isFinite(n)
        ? n
        : Number.POSITIVE_INFINITY;
    });
  };
  const left = segs(a);
  const right = segs(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const l = left[i] ?? -1;
    const r = right[i] ?? -1;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}
