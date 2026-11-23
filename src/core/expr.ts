// Expressões matemáticas seguras (sem eval): análise sintática própria + avaliação. Usado pelos gráficos de funções
// e pela calculadora. Aceita: números (1.5, 2e3, vírgula decimal 1,5), x/y/t, pi/π, e, + − * / ^ (direita), % (módulo),
// ! (fatorial), multiplicação implícita (2x, 3(x+1), (x+1)(x−1), 2pi, x sin x), funções comuns e "y =" / "f(x) =" na frente.
export type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "un"; op: "-" | "+" | "!"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^" | "%"; a: Node; b: Node }
  | { k: "fn"; name: string; args: Node[] };

const FNS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan, sen: Math.sin,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsen: Math.asin, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, arctg: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, raiz: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log, log: Math.log10, log2: Math.log2, lg: Math.log10,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, sgn: Math.sign,
  min: Math.min, max: Math.max, mod: (a, b) => a % b,
  sec: (a) => 1 / Math.cos(a), csc: (a) => 1 / Math.sin(a), cot: (a) => 1 / Math.tan(a), cotg: (a) => 1 / Math.tan(a), cossec: (a) => 1 / Math.sin(a),
  deg: (a) => (a * 180) / Math.PI, rad: (a) => (a * Math.PI) / 180,
};
const CONSTS: Record<string, number> = { pi: Math.PI, "π": Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };

export const FUNCTION_NAMES = Object.keys(FNS);

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function lex(src: string): Tok[] {
  const s = src.replace(/[−–]/g, "-").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/²/g, "^2").replace(/³/g, "^3");
  const out: Tok[] = [];
  const multiArg = /(min|max|mod)\s*\(/i.test(s);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      let num = "";
      while (j < s.length && /[0-9.,]/.test(s[j])) {
        if (s[j] === ",") {
          // vírgula decimal (1,5) só quando não há função de vários argumentos e está entre dígitos
          if (multiArg || !/[0-9]/.test(s[j + 1] ?? "") || num.includes(".")) break;
          num += ".";
        } else num += s[j];
        j++;
      }
      if (/[eE]/.test(s[j] ?? "") && /[-+0-9]/.test(s[j + 1] ?? "") && /[0-9]/.test(s[j + 1] === "-" || s[j + 1] === "+" ? s[j + 2] ?? "" : s[j + 1])) {
        let k = j + 1;
        if (s[k] === "-" || s[k] === "+") k++;
        while (k < s.length && /[0-9]/.test(s[k])) k++;
        num += s.slice(j, k);
        j = k;
      }
      const v = Number(num);
      if (!Number.isFinite(v)) throw new Error(`Número inválido: ${num}`);
      out.push({ t: "num", v });
      i = j;
      continue;
    }
    if (/[a-zA-Zπ_]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9π_]/.test(s[j])) j++;
      out.push({ t: "id", v: s.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/^%!(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Símbolo desconhecido: ${c}`);
  }
  return splitIds(out);
}

/** "xsinx" e "2pi" viram x·sin·x e 2·pi: separa identificadores colados em funções/constantes/variáveis conhecidas. */
function splitIds(toks: Tok[]): Tok[] {
  const known = [...Object.keys(FNS), ...Object.keys(CONSTS), "x", "y", "t", "n"].sort((a, b) => b.length - a.length);
  const out: Tok[] = [];
  for (const t of toks) {
    if (t.t !== "id" || known.includes(t.v)) { out.push(t); continue; }
    let rest = t.v;
    const parts: string[] = [];
    while (rest) {
      const k = known.find((w) => rest.startsWith(w));
      if (!k) { parts.length = 0; break; }
      parts.push(k);
      rest = rest.slice(k.length);
    }
    if (parts.length) parts.forEach((p) => out.push({ t: "id", v: p }));
    else out.push(t);
  }
  return out;
}

export function parse(src: string): Node {
  let text = src.trim();
  // "y = …", "f(x) = …"
  const eq = text.indexOf("=");
  if (eq >= 0) text = text.slice(eq + 1);
  if (!text.trim()) throw new Error("Expressão vazia");
  const toks = lex(text);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const eat = (v: string) => { if (!isOp(v)) throw new Error(`Esperava “${v}”`); p++; };

  // começa um fator? (para multiplicação implícita)
  const startsFactor = () => {
    const t = peek();
    return !!t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "("));
  };

  function expr(): Node {
    let a = term();
    while (isOp("+") || isOp("-")) { const op = (toks[p++] as { v: "+" | "-" }).v; a = { k: "bin", op, a, b: term() }; }
    return a;
  }
  function term(): Node {
    let a = unary();
    for (;;) {
      if (isOp("*") || isOp("/") || isOp("%")) { const op = (toks[p++] as { v: "*" | "/" | "%" }).v; a = { k: "bin", op, a, b: unary() }; }
      else if (startsFactor()) a = { k: "bin", op: "*", a, b: power() };
      else break;
    }
    return a;
  }
  function unary(): Node {
    if (isOp("-")) { p++; return { k: "un", op: "-", a: unary() }; }
    if (isOp("+")) { p++; return unary(); }
    return power();
  }
  function power(): Node {
    const base = postfix();
    if (isOp("^")) { p++; return { k: "bin", op: "^", a: base, b: unary() }; }
    return base;
  }
  function postfix(): Node {
    let a = atom();
    while (isOp("!")) { p++; a = { k: "un", op: "!", a }; }
    return a;
  }
  function atom(): Node {
    const t = peek();
    if (!t) throw new Error("Expressão incompleta");
    if (t.t === "num") { p++; return { k: "num", v: t.v }; }
    if (t.t === "op" && t.v === "(") { p++; const e = expr(); eat(")"); return e; }
    if (t.t === "op" && t.v === "|") throw new Error("Use abs(…)");
    if (t.t === "id") {
      p++;
      if (t.v in FNS) {
        if (isOp("(")) {
          p++;
          const args = [expr()];
          while (isOp(",")) { p++; args.push(expr()); }
          eat(")");
          return { k: "fn", name: t.v, args };
        }
        // "sin x", "sen 2x": argumento sem parênteses = o próximo fator com potência
        return { k: "fn", name: t.v, args: [power()] };
      }
      if (t.v in CONSTS) return { k: "num", v: CONSTS[t.v] };
      if (t.v === "x" || t.v === "y" || t.v === "t" || t.v === "n") return { k: "var", name: t.v };
      throw new Error(`Não conheço “${t.v}”`);
    }
    throw new Error(`Não esperava “${t.v}”`);
  }

  const n = expr();
  if (p < toks.length) throw new Error(`Sobrou “${(toks[p] as { v: string | number }).v}”`);
  return n;
}

function fact(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function evaluate(n: Node, vars: Record<string, number> = {}): number {
  switch (n.k) {
    case "num": return n.v;
    case "var": return vars[n.name] ?? NaN;
    case "un": {
      const a = evaluate(n.a, vars);
      return n.op === "-" ? -a : n.op === "!" ? fact(a) : a;
    }
    case "bin": {
      const a = evaluate(n.a, vars), b = evaluate(n.b, vars);
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "^": return Math.pow(a, b);
      }
    }
    // eslint-disable-next-line no-fallthrough
    case "fn": return FNS[n.name](...n.args.map((x) => evaluate(x, vars)));
  }
}

/** Compila "y = …" numa função de x (lança erro com mensagem em português se não der). */
export function compile(src: string): (x: number) => number {
  const n = parse(src);
  return (x: number) => evaluate(n, { x, t: x, n: x });
}

/** Calculadora: avalia e devolve o número ou uma mensagem de erro. */
export function calc(src: string): { ok: true; value: number } | { ok: false; error: string } {
  try {
    const n = parse(src);
    const v = evaluate(n, {});
    if (Number.isNaN(v)) return { ok: false, error: "Resultado indefinido" };
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Expressão inválida" };
  }
}

/** Número curto e legível (até 10 algarismos significativos, sem lixo de ponto flutuante, vírgula decimal). */
export function fmt(v: number, digits = 10): string {
  if (!Number.isFinite(v)) return v > 0 ? "∞" : v < 0 ? "−∞" : "indefinido";
  if (Math.abs(v) < 1e-12) return "0";
  const s = Math.abs(v) >= 1e12 || Math.abs(v) < 1e-6 ? v.toExponential(6) : String(Number(v.toPrecision(digits)));
  return s.replace(".", ",").replace("-", "−");
}

/** Compila uma função de duas variáveis, f(x, y) ("z = x^2 + y^2"). */
export function compile2(src: string): (x: number, y: number) => number {
  const n = parse(src);
  return (x: number, y: number) => evaluate(n, { x, y });
}
