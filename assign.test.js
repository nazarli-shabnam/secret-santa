const test = require("node:test");
const assert = require("node:assert");
const { buildAssignments, validateRoster } = require("./assign");

function check({ participants, doubleSpinner = null, enforceFamilies }) {
  const res = buildAssignments({ participants, doubleSpinner, enforceFamilies });
  assert.ok(res.ok, res.reason);
  const familyOf = new Map(participants.map((p) => [p.name, (p.family || "").toLowerCase()]));
  const received = new Map();
  for (const p of participants) {
    const gifts = res.assignments[p.name];
    assert.strictEqual(gifts.length, p.name === doubleSpinner ? 2 : 1);
    assert.strictEqual(new Set(gifts).size, gifts.length, "duplicate receiver for one giver");
    for (const r of gifts) {
      assert.notStrictEqual(r, p.name, "self assignment");
      if (enforceFamilies && familyOf.get(p.name)) {
        assert.notStrictEqual(familyOf.get(r), familyOf.get(p.name), "same family");
      }
      received.set(r, (received.get(r) || 0) + 1);
    }
  }
  for (const p of participants) {
    assert.strictEqual(received.get(p.name), p.name === doubleSpinner ? 2 : 1);
  }
}

const people = (spec) =>
  spec.flatMap(([family, n]) =>
    Array.from({ length: n }, (_, i) => ({ name: `${family || "x"}${i}${Math.random()}`, family }))
  );

test("even roster, no family rule", () => {
  check({ participants: people([["", 6]]), enforceFamilies: false });
});

test("two players swap", () => {
  check({ participants: people([["", 2]]), enforceFamilies: false });
});

test("odd roster with double-spinner", () => {
  const participants = people([["", 5]]);
  check({ participants, doubleSpinner: participants[2].name, enforceFamilies: false });
});

test("three players with double-spinner", () => {
  const participants = people([["", 3]]);
  check({ participants, doubleSpinner: participants[0].name, enforceFamilies: false });
});

test("family rule honoured", () => {
  check({ participants: people([["a", 3], ["b", 3], ["c", 2]]), enforceFamilies: true });
});

test("family rule + double-spinner", () => {
  const participants = people([["a", 3], ["b", 2], ["c", 2]]);
  check({ participants, doubleSpinner: participants[0].name, enforceFamilies: true });
});

test("family rule infeasible when a family is over half", () => {
  const participants = people([["a", 5], ["b", 2]]);
  const reason = validateRoster({ participants, enforceFamilies: true });
  assert.match(reason, /too large/);
  assert.strictEqual(buildAssignments({ participants, enforceFamilies: true }).ok, false);
});

test("same roster works with the family rule off", () => {
  check({ participants: people([["a", 5], ["b", 2]]), enforceFamilies: false });
});

test("family comparison is case-insensitive", () => {
  const participants = [
    { name: "p1", family: "Smith" },
    { name: "p2", family: "smith" },
    { name: "p3", family: "Jones" },
    { name: "p4", family: "Jones" },
  ];
  check({ participants, enforceFamilies: true });
});

test("stress: random rosters", () => {
  for (let i = 0; i < 1000; i++) {
    const familyCount = 2 + Math.floor(Math.random() * 5);
    const spec = Array.from({ length: familyCount }, (_, f) => [
      Math.random() < 0.2 ? "" : `f${f}`,
      1 + Math.floor(Math.random() * 4),
    ]);
    const participants = people(spec);
    const enforceFamilies = Math.random() < 0.7;
    const doubleSpinner = participants.length % 2 ? participants[0].name : null;
    const res = buildAssignments({ participants, doubleSpinner, enforceFamilies });
    if (validateRoster({ participants, doubleSpinner, enforceFamilies }) === null) {
      check({ participants, doubleSpinner, enforceFamilies });
    } else {
      assert.strictEqual(res.ok, false);
    }
  }
});
