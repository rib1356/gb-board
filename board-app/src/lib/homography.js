// How one board photo maps onto another. Rob taps the same spots on both
// photos; a homography (a 3x3 perspective transform) through those pairs
// carries any point on the old photo to where it sits on the new one --
// including a change of camera angle, which a plain shift/zoom/rotate can't.
//
// Everything works in photo fractions (0-1), the same units holds are stored
// in. H is 9 numbers, row-major, normalised so H[8] is 1.

// Below this, two taps are the same spot / three taps are in a line. In
// fractions: ~1.4px apart on a 1400px photo, or a triangle too flat to fit.
const MIN_SPREAD = 1e-3;

const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Whether four of the points are spread out enough to pin down a fit: no two
// on the same spot and no three in a line.
function hasGoodFour(points) {
  const n = points.length;
  const good = (quad) => {
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        if (dist(quad[i], quad[j]) < MIN_SPREAD) return false;
        for (let k = j + 1; k < 4; k++) {
          if (Math.abs(cross(quad[i], quad[j], quad[k])) < MIN_SPREAD) return false;
        }
      }
    }
    return true;
  };
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
    if (good([points[a], points[b], points[c], points[d]])) return true;
  }
  return false;
}

// Hartley normalisation: centre the points and scale them to an average
// distance of sqrt(2), so the solve is well conditioned.
function normaliser(points) {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const mean = points.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / points.length;
  const s = Math.SQRT2 / mean;
  return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
}

function multiply(A, B) {
  const out = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    for (let k = 0; k < 3; k++) out[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
  }
  return out;
}

function scaled(H) {
  if (!Number.isFinite(H[8]) || Math.abs(H[8]) < 1e-12) return null;
  const out = H.map((v) => v / H[8]);
  return out.every(Number.isFinite) ? out : null;
}

// Solves M x = v in place (Gaussian elimination, partial pivoting); null when
// the system has no single answer.
function solveLinear(M, v) {
  const n = v.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    [v[col], v[pivot]] = [v[pivot], v[col]];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c < n; c++) M[r][c] -= f * M[col][c];
      v[r] -= f * v[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = v[r];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x;
}

export function applyHomography(H, { x, y }) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

export function invertHomography(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return scaled([
    A, -(b * i - c * h), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * h - b * g), a * e - b * d,
  ].map((v) => v / det));
}

// pairs: [{ from: {x,y}, to: {x,y} }], at least 4. With more than 4 it's a
// least-squares fit. Null when there's no sensible fit.
export function solveHomography(pairs) {
  if (!pairs || pairs.length < 4) return null;
  const from = pairs.map((p) => p.from);
  const to = pairs.map((p) => p.to);
  if (!hasGoodFour(from) || !hasGoodFour(to)) return null;

  const Tf = normaliser(from);
  const Tt = normaliser(to);
  const nf = from.map((p) => applyHomography(Tf, p));
  const nt = to.map((p) => applyHomography(Tt, p));

  // Each pair gives two equations in h0..h7 (h8 = 1). Least squares through
  // the normal equations: (AᵀA) h = Aᵀb.
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const addRow = (row, rhs) => {
    for (let r = 0; r < 8; r++) {
      Atb[r] += row[r] * rhs;
      for (let c = 0; c < 8; c++) AtA[r][c] += row[r] * row[c];
    }
  };
  nf.forEach(({ x, y }, k) => {
    const { x: u, y: v } = nt[k];
    addRow([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    addRow([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  });
  const h = solveLinear(AtA, Atb);
  if (!h) return null;

  const TtInv = invertHomography(Tt);
  if (!TtInv) return null;
  return scaled(multiply(multiply(TtInv, [...h, 1]), Tf));
}

const tidy = (v) => {
  const r = Number(v.toFixed(6));
  return Object.is(r, -0) ? 0 : r;
};

// A CSS transform that draws an element of width x height px (with
// transform-origin 0 0) through H, so an old photo or highlight laid over the
// new photo lands where it belongs.
export function cssMatrix3d(H, width, height) {
  const S = [width, 0, 0, 0, height, 0, 0, 0, 1];
  const Sinv = [1 / width, 0, 0, 0, 1 / height, 0, 0, 0, 1];
  const [a, b, c, d, e, f, g, h, i] = scaled(multiply(multiply(S, H), Sinv));
  return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i].map(tidy).join(',')})`;
}
