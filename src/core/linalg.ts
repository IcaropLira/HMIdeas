// Álgebra linear e vetorial para a calculadora de matrizes: ler matrizes/vetores, operações, escalonamento, sistemas,
// autovalores e geometria analítica (distâncias, ângulos, projeções). Puro.
import { calc } from "./expr";

export type Matrix = number[][];
const EPS = 1e-10;

/** Lê "1 2; 3 4", "[[1,2],[3,4]]", linhas separadas por quebra de linha, vírgulas ou espaços. Aceita expressões (sqrt(2), pi/4). */
export function parseMatrix(text: string): Matrix {
  const t = text.trim().replace(/^\[\s*\[/, "").replace(/\]\s*\]$/, "");
  if (!t) throw new Error("Matriz vazia");
  const rows = t.split(/\]\s*,?\s*\[|;|\n/).map((r) => r.replace(/[[\]]/g, "").trim()).filter(Boolean);
  const M = rows.map((r) => {
    // separa por espaço ou vírgula fora de parênteses
    const cells: string[] = [];
    let depth = 0, cur = "";
    for (const ch of r) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (depth === 0 && (ch === "," || /\s/.test(ch))) { if (cur) cells.push(cur); cur = ""; } else cur += ch;
    }
    if (cur) cells.push(cur);
    return cells.map((c) => { const v = calc(c); if (!v.ok) throw new Error(`Valor inválido: ${c}`); return v.value; });
  });
  const n = M[0].length;
  if (M.some((r) => r.length !== n)) throw new Error("As linhas têm tamanhos diferentes");
  return M;
}

export const parseVector = (text: string): number[] => {
  const M = parseMatrix(text.replace(/[()]/g, (c) => (c === "(" ? "" : "")));
  return M.length === 1 ? M[0] : M.map((r) => r[0]);
};

const dims = (A: Matrix) => [A.length, A[0]?.length ?? 0] as const;
const clone = (A: Matrix) => A.map((r) => [...r]);
export const identity = (n: number): Matrix => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

export function add(A: Matrix, B: Matrix, s = 1): Matrix {
  const [m, n] = dims(A);
  if (B.length !== m || B[0].length !== n) throw new Error("Tamanhos diferentes para somar");
  return A.map((r, i) => r.map((v, j) => v + s * B[i][j]));
}
export function multiply(A: Matrix, B: Matrix): Matrix {
  const [m, n] = dims(A), [p, q] = dims(B);
  if (n !== p) throw new Error(`Não dá para multiplicar ${m}×${n} por ${p}×${q}`);
  return Array.from({ length: m }, (_, i) => Array.from({ length: q }, (_, j) => A[i].reduce((s, v, k) => s + v * B[k][j], 0)));
}
export const transpose = (A: Matrix): Matrix => A[0].map((_, j) => A.map((r) => r[j]));
export const scale = (A: Matrix, k: number): Matrix => A.map((r) => r.map((v) => v * k));

/** Forma escalonada reduzida (Gauss–Jordan) e o posto. */
export function rref(A: Matrix): { R: Matrix; rank: number; pivots: number[] } {
  const R = clone(A);
  const [m, n] = dims(R);
  const pivots: number[] = [];
  let row = 0;
  for (let col = 0; col < n && row < m; col++) {
    let best = row;
    for (let i = row + 1; i < m; i++) if (Math.abs(R[i][col]) > Math.abs(R[best][col])) best = i;
    if (Math.abs(R[best][col]) < EPS) continue;
    [R[row], R[best]] = [R[best], R[row]];
    const p = R[row][col];
    R[row] = R[row].map((v) => v / p);
    for (let i = 0; i < m; i++) if (i !== row && Math.abs(R[i][col]) > EPS) { const f = R[i][col]; R[i] = R[i].map((v, j) => v - f * R[row][j]); }
    pivots.push(col);
    row++;
  }
  return { R: R.map((r) => r.map((v) => (Math.abs(v) < EPS ? 0 : v))), rank: pivots.length, pivots };
}

export function det(A: Matrix): number {
  const [m, n] = dims(A);
  if (m !== n) throw new Error("Determinante só de matriz quadrada");
  const R = clone(A);
  let d = 1;
  for (let c = 0; c < n; c++) {
    let best = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(R[i][c]) > Math.abs(R[best][c])) best = i;
    if (Math.abs(R[best][c]) < EPS) return 0;
    if (best !== c) { [R[c], R[best]] = [R[best], R[c]]; d = -d; }
    d *= R[c][c];
    for (let i = c + 1; i < n; i++) { const f = R[i][c] / R[c][c]; for (let j = c; j < n; j++) R[i][j] -= f * R[c][j]; }
  }
  return d;
}

export function inverse(A: Matrix): Matrix {
  const [m, n] = dims(A);
  if (m !== n) throw new Error("Inversa só de matriz quadrada");
  const aug = A.map((r, i) => [...r, ...identity(n)[i]]);
  const { R, rank } = rref(aug);
  if (rank < n || R.some((r, i) => Math.abs(r[i] - 1) > 1e-8)) throw new Error("Matriz singular (determinante 0): não tem inversa");
  return R.map((r) => r.slice(n));
}

/** Resolve Ax = b. Devolve a solução única, ou descreve o sistema (impossível / infinitas soluções). */
export function solve(A: Matrix, b: number[]): { kind: "unique"; x: number[] } | { kind: "none" } | { kind: "infinite"; rank: number; free: number } {
  const n = A[0].length;
  const { R, rank, pivots } = rref(A.map((r, i) => [...r, b[i] ?? 0]));
  if (pivots.includes(n)) return { kind: "none" };
  if (rank < n) return { kind: "infinite", rank, free: n - rank };
  return { kind: "unique", x: R.slice(0, n).map((r) => r[n]) };
}

/** Autovalores (reais e complexos) pelo algoritmo QR com deslocamento; 2×2 resolvido de forma exata. */
export function eigenvalues(A: Matrix): { re: number; im: number }[] {
  const [m, n] = dims(A);
  if (m !== n) throw new Error("Autovalores só de matriz quadrada");
  if (n === 1) return [{ re: A[0][0], im: 0 }];
  if (n === 2) {
    const tr = A[0][0] + A[1][1], d = det(A), disc = tr * tr - 4 * d;
    if (disc >= 0) return [{ re: (tr + Math.sqrt(disc)) / 2, im: 0 }, { re: (tr - Math.sqrt(disc)) / 2, im: 0 }];
    return [{ re: tr / 2, im: Math.sqrt(-disc) / 2 }, { re: tr / 2, im: -Math.sqrt(-disc) / 2 }];
  }
  let H = clone(A);
  for (let it = 0; it < 500; it++) {
    const mu = H[n - 1][n - 1];
    const S = H.map((r, i) => r.map((v, j) => v - (i === j ? mu : 0)));
    // QR por Gram–Schmidt modificado
    const Q: Matrix = Array.from({ length: n }, () => Array(n).fill(0));
    const Rm: Matrix = Array.from({ length: n }, () => Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const v = S.map((r) => r[j]);
      for (let k = 0; k < j; k++) {
        const qk = Q.map((r) => r[k]);
        Rm[k][j] = qk.reduce((s, x, i) => s + x * v[i], 0);
        for (let i = 0; i < n; i++) v[i] -= Rm[k][j] * qk[i];
      }
      Rm[j][j] = Math.hypot(...v);
      for (let i = 0; i < n; i++) Q[i][j] = Rm[j][j] > EPS ? v[i] / Rm[j][j] : 0;
    }
    H = multiply(Rm, Q).map((r, i) => r.map((v, j) => v + (i === j ? mu : 0)));
    let off = 0;
    for (let i = 1; i < n; i++) off += Math.abs(H[i][i - 1]);
    if (off < 1e-11) break;
  }
  // lê os blocos 1×1 e 2×2 da diagonal
  const out: { re: number; im: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (i + 1 < n && Math.abs(H[i + 1][i]) > 1e-6) {
      const sub = [[H[i][i], H[i][i + 1]], [H[i + 1][i], H[i + 1][i + 1]]];
      out.push(...eigenvalues(sub));
      i++;
    } else out.push({ re: H[i][i], im: 0 });
  }
  return out.sort((a, b) => b.re - a.re || b.im - a.im);
}

/** Autovetor (do núcleo de A − λI) para um autovalor real. */
export function eigenvector(A: Matrix, lambda: number): number[] | null {
  const n = A.length;
  const { R, pivots } = rref(A.map((r, i) => r.map((v, j) => v - (i === j ? lambda : 0))).map((r) => r.map((v) => (Math.abs(v) < 1e-7 ? 0 : v))));
  const free = Array.from({ length: n }, (_, j) => j).find((j) => !pivots.includes(j));
  if (free === undefined) return null;
  const x = Array(n).fill(0);
  x[free] = 1;
  pivots.forEach((pc, r) => { x[pc] = -R[r][free]; });
  const len = Math.hypot(...x);
  return x.map((v) => v / len);
}

// ---------------- vetores ----------------
export const dot = (u: number[], v: number[]) => u.reduce((s, x, i) => s + x * (v[i] ?? 0), 0);
export const norm = (u: number[]) => Math.hypot(...u);
export function cross(u: number[], v: number[]): number[] {
  const [a1, a2, a3 = 0] = u, [b1, b2, b3 = 0] = v;
  return [a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1];
}
export const angle = (u: number[], v: number[]) => Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (norm(u) * norm(v)))));
export const projection = (u: number[], v: number[]) => { const k = dot(u, v) / dot(v, v); return v.map((x) => x * k); };
export const distance = (p: number[], q: number[]) => norm(p.map((x, i) => x - (q[i] ?? 0)));

/** Distância do ponto P à reta que passa por A e B (2D ou 3D). */
export function pointLineDistance(P: number[], A: number[], B: number[]): number {
  const d = B.map((x, i) => x - A[i]);
  const w = P.map((x, i) => x - A[i]);
  const c = cross([...w, 0].slice(0, 3), [...d, 0].slice(0, 3));
  return norm(c) / norm(d);
}

/** Texto bonito de uma matriz (colunas alinhadas, vírgula decimal). */
export function formatMatrix(A: Matrix, digits = 6): string {
  const f = (v: number) => { const r = Number(v.toPrecision(digits)); return (Object.is(r, -0) ? 0 : r).toString().replace(".", ",").replace("-", "−"); };
  const cells = A.map((r) => r.map(f));
  const w = A[0].map((_, j) => Math.max(...cells.map((r) => r[j].length)));
  return cells.map((r) => "[ " + r.map((c, j) => c.padStart(w[j])).join("  ") + " ]").join("\n");
}
