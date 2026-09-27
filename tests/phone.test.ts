import test from "node:test";
import assert from "node:assert/strict";
import { extractSessionCode } from "../src/phone";

test("phone QR scanner accepts pairing links and short codes only", () => {
  assert.equal(extractSessionCode("AB23CD"), "AB23CD");
  assert.equal(
    extractSessionCode("https://example.test/phone?session=ab23cd"),
    "AB23CD",
  );
  assert.equal(extractSessionCode("https://example.test/phone/AB23CD"), "AB23CD");
  assert.equal(extractSessionCode("https://example.test/?campaign=AB23CD"), null);
  assert.equal(extractSessionCode("ABO3CD"), null);
});
