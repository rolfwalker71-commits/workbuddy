import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTENDEE_CONTACT_REASON,
  isInternalColleagueEmail,
  isMariCustomerCardCode,
  partnerSuggestionChipLabel,
  partnerSuggestionChipReason,
  pickMariProjectCustomer,
} from "@/lib/mari/customers";

test("isMariCustomerCardCode accepts C-cards only", () => {
  assert.equal(isMariCustomerCardCode("C1507"), true);
  assert.equal(isMariCustomerCardCode("c1507"), true);
  assert.equal(isMariCustomerCardCode("V1356"), false);
  assert.equal(isMariCustomerCardCode("S1000"), false);
  assert.equal(isMariCustomerCardCode(""), false);
  assert.equal(isMariCustomerCardCode(null), false);
});

test("pickMariProjectCustomer drops vendors and duplicate C-cards", () => {
  assert.deepEqual(
    pickMariProjectCustomer([
      { cardCode: "C1507", name: "M. Tanner AG" },
      { cardCode: "C1507", name: "M. Tanner AG" },
      { cardCode: "V1356", name: "Adrian Lenherr" },
    ]),
    { cardCode: "C1507", name: "M. Tanner AG" }
  );
  assert.deepEqual(
    pickMariProjectCustomer([
      { cardCode: "c1507", name: "M. Tanner AG" },
      { cardCode: "C1507", name: "M. Tanner AG (alt)" },
      { cardCode: "V1356", name: "Adrian Lenherr" },
    ]),
    { cardCode: "c1507", name: "M. Tanner AG" }
  );
  assert.equal(
    pickMariProjectCustomer([{ cardCode: "V1356", name: "Adrian Lenherr" }]),
    null
  );
  assert.equal(pickMariProjectCustomer([]), null);
});

test("isInternalColleagueEmail skips company login domains", () => {
  assert.equal(isInternalColleagueEmail("rolf.walker@an-group.one"), true);
  assert.equal(isInternalColleagueEmail("kunde@enso.ch"), false);
  assert.equal(isInternalColleagueEmail("nugnes.vincenzo@mtannerag.ch"), false);
  assert.equal(isInternalColleagueEmail(""), false);
});

test("partnerSuggestionChipLabel prefers project, else Name · email", () => {
  assert.equal(
    partnerSuggestionChipLabel({
      name: "M. Tanner AG",
      cardCode: "C1507",
      projectNumber: "P600111",
      contactName: "Nugnes Vincenzo",
      matchedEmail: "nugnes.vincenzo@mtannerag.ch",
    }),
    "M. Tanner AG · P600111"
  );
  assert.equal(
    partnerSuggestionChipLabel({
      name: "M. Tanner AG",
      cardCode: "C1507",
      projectNumber: null,
      contactName: "Nugnes Vincenzo",
      matchedEmail: "nugnes.vincenzo@mtannerag.ch",
    }),
    "Nugnes Vincenzo · nugnes.vincenzo@mtannerag.ch"
  );
});

test("partnerSuggestionChipReason marks attendee contact chips", () => {
  assert.equal(
    partnerSuggestionChipReason({
      reason: ATTENDEE_CONTACT_REASON,
      matchedEmail: "nugnes.vincenzo@mtannerag.ch",
      source: "ocpr",
    }),
    "Ansprechpartner im Termin"
  );
  assert.equal(
    partnerSuggestionChipReason({
      reason: null,
      matchedEmail: null,
      source: "title",
    }),
    "Aus dem Betreff"
  );
});
