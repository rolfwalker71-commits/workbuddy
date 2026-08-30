import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMariContractFields,
  contractFieldsFromMariRow,
  findMariKeyPair,
  firstPositiveInt,
  formatMariContractLabel,
  formatMariContractListLine,
  formatMariContractListLines,
  formatPeriodLabel,
  projectNumbersNeedingLabel,
  timeLineToBookPrefill,
  type MariKeyPair,
} from "./timekeeping-shared.ts";

test("firstPositiveInt skips 0 so missing SQL ContractID does not hide REST", () => {
  assert.equal(firstPositiveInt(0, 88421), 88421);
  assert.equal(firstPositiveInt(undefined, 0, "88421"), 88421);
  assert.equal(firstPositiveInt(0, null, ""), 0);
  assert.equal(firstPositiveInt(12, 99), 12);
});

test("findMariKeyPair matches numeric ContractID to keyInternal", () => {
  const row: MariKeyPair = {
    matchcode: "Wartung",
    keyVisible: "V60011100",
    keyInternal: "88421",
    indent: 0,
    indentParent: false,
  };
  assert.equal(findMariKeyPair([row], 88421)?.keyVisible, "V60011100");
  assert.equal(findMariKeyPair([row], "88421")?.keyInternal, "88421");
  assert.equal(findMariKeyPair([row], "V60011100")?.keyInternal, "88421");
  assert.equal(findMariKeyPair([row], 0), undefined);
});

test("timeLineToBookPrefill keeps Kunde, Projekt and Vertrag on edit", () => {
  const prefill = timeLineToBookPrefill(
    {
      serviceDate: "2026-08-12",
      projectNumber: "P600084",
      projectCustomer: "Bübchen Werke",
      activity: "Probleme mit API Gateway",
      memo: null,
      hours: 1.5,
      hoursBillable: 1.5,
      contractId: 88421,
      contractPositionId: 3,
    },
    {
      serviceDate: "2026-08-12",
      projectNumber: "P600084",
      projectCustomer: "Bübchen Werke",
      activity: "Probleme mit API Gateway",
      hours: 1.5,
      hoursBillable: 1.5,
      contractId: 0,
    }
  );
  assert.equal(prefill.contractId, 88421);
  assert.equal(prefill.contractPositionId, 3);
  assert.equal(prefill.projectNumber, "P600084");
  assert.equal(prefill.projectLabel, "Bübchen Werke (P600084)");
  assert.equal(prefill.customerName, "Bübchen Werke");
  assert.equal(prefill.hours, 1.5);
  assert.equal(prefill.hoursBillable, 1.5);
});

test("timeLineToBookPrefill falls back to list-line contract when detail is 0", () => {
  const prefill = timeLineToBookPrefill(
    {
      serviceDate: "2026-08-12",
      projectNumber: "P600084",
      activity: "Analyse",
      hours: 1.5,
      hoursBillable: 1.5,
      contractId: 0,
    },
    {
      projectNumber: "P600084",
      projectCustomer: "Bübchen Werke",
      activity: "Analyse",
      contractId: 88421,
      hours: 1.5,
      hoursBillable: 1.5,
    }
  );
  assert.equal(prefill.contractId, 88421);
  assert.equal(prefill.projectLabel, "Bübchen Werke (P600084)");
});

test("contractFieldsFromMariRow uses ContractID / AbsID and MARI number + name", () => {
  const fromSql = contractFieldsFromMariRow({
    ContractID: 0,
    AbsID: 88421,
    Contract: "V60011100",
    ContractName: "Wartung 2026",
    ContractPositionID: 3,
    ContractPositionNumber: "10",
    ContractPositionName: "Wochenendzuschlag",
  });
  assert.equal(fromSql.contractId, 88421);
  assert.equal(fromSql.contractNumber, "V60011100");
  assert.equal(fromSql.contractName, "Wartung 2026");
  assert.equal(fromSql.contractPositionId, 3);
  assert.equal(fromSql.contractPositionNumber, "10");
  assert.equal(fromSql.contractPositionName, "Wochenendzuschlag");

  const empty = contractFieldsFromMariRow({ ContractID: 0, AbsID: 0 });
  assert.equal(empty.contractId, 0);
  assert.equal(empty.contractNumber, null);
  assert.equal(empty.contractName, null);
  assert.equal(empty.contractPositionId, 0);
});

test("applyMariContractFields uses REST id when SQL ContractID is 0", () => {
  const merged = applyMariContractFields(
    { contractId: 0, contractPositionId: 0 },
    { ContractID: 0, AbsID: 0 },
    {
      ContractID: 88421,
      Contract: "V60011100",
      ContractName: "Wartung 2026",
      ContractPositionID: 3,
      ContractPositionNumber: "10",
      ContractPositionName: "Wochenendzuschlag",
    }
  );
  assert.equal(merged.contractId, 88421);
  assert.equal(merged.contractNumber, "V60011100");
  assert.equal(merged.contractName, "Wartung 2026");
  assert.equal(merged.contractPositionId, 3);
  assert.equal(merged.contractPositionNumber, "10");
  assert.equal(merged.contractPositionName, "Wochenendzuschlag");
});

test("formatMariContractLabel joins number and Bezeichnung without inventing", () => {
  assert.equal(
    formatMariContractLabel("V60011100", "Wartung 2026"),
    "V60011100 · Wartung 2026"
  );
  assert.equal(formatMariContractLabel("V60011100", "V60011100"), "V60011100");
  assert.equal(formatMariContractLabel(null, "Wartung"), "Wartung");
  assert.equal(formatMariContractLabel("", ""), null);
});

test("formatMariContractListLine shows Kein Vertrag only when no contract was booked", () => {
  assert.equal(
    formatMariContractListLine({
      contractId: 88421,
      contractNumber: "V60011100",
      contractName: "Wartung 2026",
    }),
    "V60011100 · Wartung 2026"
  );
  assert.deepEqual(
    formatMariContractListLines({
      contractId: 88421,
      contractNumber: "V60011100",
      contractName: "Wartung 2026",
      contractPositionId: 3,
      contractPositionNumber: "10",
      contractPositionName: "Wochenendzuschlag",
    }),
    ["V60011100 · Wartung 2026", "10 · Wochenendzuschlag"]
  );
  assert.equal(
    formatMariContractListLine({
      contractId: 88421,
      contractNumber: "V60011100",
      contractName: "Wartung 2026",
      contractPositionId: 3,
      contractPositionNumber: "10",
      contractPositionName: "Wochenendzuschlag",
    }),
    "V60011100 · Wartung 2026 · 10 · Wochenendzuschlag"
  );
  assert.equal(
    formatMariContractListLine({ contractId: 88421 }),
    null
  );
  assert.equal(
    formatMariContractListLine({ contractId: 0 }),
    "Kein Vertrag"
  );
  assert.equal(
    formatMariContractListLine({ contractId: null, contractNumber: null }),
    "Kein Vertrag"
  );
});

test("timeLineToBookPrefill keeps Vertrag number from list line", () => {
  const prefill = timeLineToBookPrefill(
    {
      serviceDate: "2026-08-12",
      projectNumber: "P600084",
      activity: "Analyse",
      hours: 1.5,
      hoursBillable: 1.5,
      contractId: 88421,
    },
    {
      projectNumber: "P600084",
      contractId: 88421,
      contractNumber: "V60011100",
      hours: 1.5,
      hoursBillable: 1.5,
    }
  );
  assert.equal(prefill.contractId, 88421);
  assert.equal(prefill.contractVisible, "V60011100");
});

test("projectNumbersNeedingLabel skips labeled and duplicate projects", () => {
  assert.deepEqual(
    projectNumbersNeedingLabel([
      { projectNumber: "P1", projectCustomer: "Kunde" },
      { projectNumber: "P2" },
      { projectNumber: "P2", projectCustomer: null },
      { projectNumber: "  " },
      { projectNumber: "P3", projectCustomer: "" },
    ]),
    ["P2", "P3"]
  );
});

test("formatPeriodLabel prefixes German weekday on a single day", () => {
  assert.equal(formatPeriodLabel("day", "2026-08-08", "2026-08-08"), "Samstag, 08.08.2026");
  assert.equal(formatPeriodLabel("day", "2026-08-24", "2026-08-24"), "Montag, 24.08.2026");
  assert.equal(
    formatPeriodLabel("week", "2026-08-24", "2026-08-30"),
    "24.08.2026 – 30.08.2026"
  );
});
