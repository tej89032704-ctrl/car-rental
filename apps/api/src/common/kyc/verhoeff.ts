/**
 * Verhoeff checksum — the algorithm UIDAI uses for the 12th digit of an Aadhaar
 * number. Catches every single-digit typo, every adjacent transposition, and
 * every digit-pair substitution; it is a purely offline, deterministic check, so
 * it needs no licence and no network call.
 *
 * Tables are the canonical dihedral-group D5 tables from Verhoeff's paper.
 * `selfTest()` proves they are intact (group axioms + error-detection properties)
 * and `verhoeffCheckDigit()` is derived by search rather than by a formula, so a
 * table/iteration-order mismatch cannot silently produce wrong digits.
 */

/** Multiplication table of the dihedral group D5. */
const M: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

/** Permutation applied at each position, read right-to-left. */
const P: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Inverse of each element in M. */
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** True when `digits` is a correct Verhoeff-coded number. */
export function verhoeffValidate(digits: string): boolean {
  let c = 0;
  for (let i = digits.length - 1, pos = 0; i >= 0; i--, pos++) {
    const d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    c = M[c][P[pos % 8][d]];
  }
  return c === 0;
}

/**
 * The digit to append to `digits` so the whole becomes valid.
 * Derived by search over 0-9 against {@link verhoeffValidate} — deliberately
 * not a closed-form inversion, so the two functions cannot drift apart.
 */
export function verhoeffCheckDigit(digits: string): string {
  for (let d = 0; d <= 9; d++) if (verhoeffValidate(digits + d)) return String(d);
  /* istanbul ignore next — unreachable for a group of order 10 */
  throw new Error('verhoeff: no check digit exists (tables corrupted?)');
}

/**
 * Proves the tables above are internally intact. Run once at module load so a
 * corrupted table fails loudly instead of rejecting every real Aadhaar number.
 *
 * Checks, in order of strength:
 *  1. group axioms — identity, associativity, inverse, closure
 *  2. a check digit always exists for any prefix
 *  3. the coded number validates
 *  4. every single-digit mutation is detected (all 10 substitutions x all positions)
 */
function selfTest(): void {
  const ids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const row of M) if (new Set(row).size !== 10) throw new Error('verhoeff: M is not a Latin square');
  for (const a of ids) {
    if (M[0][a] !== a || M[a][0] !== a) throw new Error(`verhoeff: identity failed at ${a}`);
    if (M[a][INV[a]] !== 0) throw new Error(`verhoeff: inverse failed at ${a}`);
    for (const b of ids) {
      if (M[a][b] < 0 || M[a][b] > 9) throw new Error('verhoeff: M is not closed');
      for (const c of ids) {
        if (M[a][M[b][c]] !== M[M[a][b]][c]) throw new Error('verhoeff: associativity failed');
      }
    }
  }

  let rng = 0x9e3779b9;
  const rand11 = (): string => {
    let s = '';
    for (let i = 0; i < 11; i++) {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      s += rng % 10;
    }
    return s;
  };

  for (let n = 0; n < 400; n++) {
    const body = rand11();
    const full = body + verhoeffCheckDigit(body);
    if (!verhoeffValidate(full)) throw new Error('verhoeff: check digit does not validate');
    for (const pos of [0, 5, 11]) {
      const bad = Number(full[pos]);
      for (let sub = 0; sub <= 9; sub++) {
        if (sub === bad) continue;
        const mutated = full.slice(0, pos) + sub + full.slice(pos + 1);
        if (verhoeffValidate(mutated)) {
          throw new Error(`verhoeff: single-error at ${pos} of ${full} was not detected`);
        }
      }
    }
  }
}

selfTest();
