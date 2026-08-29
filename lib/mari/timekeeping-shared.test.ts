import assert from "node:assert/strict";
import test from "node:test";
import {
  contractFieldsFromMariRow,
  findMariKeyPair,
  firstPositiveInt,
  formatMariContractLabel,
  formatMariContractListLine,
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
  });
  assert.equal(fromSql.contractId, 88421);
  assert.equal(fromSql.contractNumber, "V60011100");
  assert.equal(fromSql.contractName, "Wartung 2026");

  const empty = contractFieldsFromMariRow({ ContractID: 0, AbsID: 0 });
  assert.equal(empty.contractId, 0);
  assert.equal(empty.contractNumber, null);
  assert.equal(empty.contractName, null);
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
