// Pure draw logic: no I/O, no Express. Computes the whole Secret Santa draw up front.

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Players with a blank family (or with the rule off) only conflict with themselves.
function makeGroupOf(participants, enforceFamilies) {
  const group = new Map();
  for (const p of participants) {
    const family = (p.family || "").trim().toLowerCase();
    group.set(p.name, enforceFamilies && family ? `family:${family}` : `solo:${p.name}`);
  }
  return group;
}

function slotsFor(participants, doubleSpinner) {
  return participants.flatMap((p) =>
    p.name === doubleSpinner ? [p.name, p.name] : [p.name]
  );
}

// Returns a human-readable reason the roster can never work, or null if it might.
// Each group gives g slots and receives g slots; its gifts must go to other groups,
// so 2*g can't exceed the total number of slots.
function validateRoster({ participants, doubleSpinner = null, enforceFamilies }) {
  if (participants.length < 2) return "Need at least 2 participating players.";
  if (doubleSpinner && !participants.some((p) => p.name === doubleSpinner)) {
    return "Double-spinner must be a participating player.";
  }

  const group = makeGroupOf(participants, enforceFamilies);
  const slots = slotsFor(participants, doubleSpinner);
  const perGroup = new Map();
  for (const name of slots) {
    const g = group.get(name);
    perGroup.set(g, (perGroup.get(g) || 0) + 1);
  }

  for (const [g, count] of perGroup) {
    if (count * 2 > slots.length) {
      if (g.startsWith("family:")) {
        const label = participants.find((p) => group.get(p.name) === g).family.trim();
        return `Family "${label}" is too large: its members can't all be matched outside the family. Turn off the family rule or split the family.`;
      }
      return "Not enough players to avoid self-assignment.";
    }
  }
  return null;
}

// One randomized backtracking attempt, most-constrained givers first.
function attempt(participants, slots, group, nodeLimit) {
  const groupSize = new Map();
  for (const name of slots) {
    const g = group.get(name);
    groupSize.set(g, (groupSize.get(g) || 0) + 1);
  }
  const givers = shuffle(slots).sort(
    (a, b) => groupSize.get(group.get(b)) - groupSize.get(group.get(a))
  );

  const remaining = new Map();
  for (const name of slots) remaining.set(name, (remaining.get(name) || 0) + 1);

  const result = new Map(participants.map((p) => [p.name, []]));
  let nodes = 0;

  function place(i) {
    if (i === givers.length) return true;
    if (++nodes > nodeLimit) return false;
    const giver = givers[i];
    const already = result.get(giver);
    for (const receiver of shuffle([...remaining.keys()])) {
      if (remaining.get(receiver) === 0) continue;
      if (group.get(receiver) === group.get(giver)) continue;
      if (already.includes(receiver)) continue;
      remaining.set(receiver, remaining.get(receiver) - 1);
      already.push(receiver);
      if (place(i + 1)) return true;
      already.pop();
      remaining.set(receiver, remaining.get(receiver) + 1);
    }
    return false;
  }

  return place(0) ? result : null;
}

// participants: [{ name, family }]. Returns { ok: true, assignments: { giver: [receivers] } }
// or { ok: false, reason }.
function buildAssignments({ participants, doubleSpinner = null, enforceFamilies }) {
  const reason = validateRoster({ participants, doubleSpinner, enforceFamilies });
  if (reason) return { ok: false, reason };

  const group = makeGroupOf(participants, enforceFamilies);
  const slots = slotsFor(participants, doubleSpinner);

  for (let i = 0; i < 100; i++) {
    const result = attempt(participants, slots, group, 5000);
    if (result) return { ok: true, assignments: Object.fromEntries(result) };
  }
  return { ok: false, reason: "Could not find a valid draw with these rules. Try adjusting families or the double-spinner." };
}

module.exports = { buildAssignments, validateRoster };
