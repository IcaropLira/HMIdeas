import { describe, expect, it } from "vitest";
import { normalizeDoc, createPage } from "./model";
import { DAY, addStat, applySrs, cleanRecordings, collectCards, dueCards, examScore, lastDays, notYetWritten, resetForExam, slideOrder, sm2, streak } from "./study";

const block = (id: string, b: object, x = 0, y = 0) => ({ id, type: "attachment", x, y, w: 300, h: 190, kind: "block", title: "", url: "", mime: "", block: b, opacity: 1 });
const card = (id: string, srs?: object) => block(id, { kind: "flashcard", front: "F" + id, back: "B", flipped: true, color: "#6A3FD1", ...(srs ? { srs } : {}) });
const NOW = 1_700_000_000_000;

describe("estudos (0.14)", () => {
  it("SM-2: acertos aumentam o intervalo; erro recomeça", () => {
    const a = sm2(undefined, 2, NOW);
    expect([a.reps, a.interval]).toEqual([1, 1]);
    const b = sm2(a, 2, NOW);
    expect(b.interval).toBe(6);
    const c = sm2(b, 2, NOW);
    expect(c.interval).toBeGreaterThanOrEqual(14);
    const easy = sm2(b, 3, NOW);
    expect(easy.interval).toBeGreaterThan(c.interval);
    expect(easy.ease).toBeGreaterThan(c.ease);
    const miss = sm2(c, 0, NOW);
    expect([miss.reps, miss.interval, miss.lapses]).toEqual([0, 0, 1]);
    expect(miss.due - NOW).toBe(10 * 60_000);
    expect(sm2({ ...c, ease: 1.3 }, 1, NOW).ease).toBe(1.3);
  });
  it("coleta cartões, escolhe os vencidos e grava as notas", () => {
    const doc = normalizeDoc({ version: 1, pages: [
      { ...createPage("A"), elements: [card("1", { ease: 2.5, interval: 1, reps: 1, due: NOW - DAY, lapses: 0 }), card("2", { ease: 2.5, interval: 6, reps: 2, due: NOW + DAY, lapses: 0 })] },
      { ...createPage("B"), elements: [card("3")] },
    ] });
    const cards = collectCards(doc);
    expect(cards.map((c) => c.el.id)).toEqual(["1", "2", "3"]);
    expect(dueCards(cards, NOW).map((c) => c.el.id)).toEqual(["1", "3"]);
    const next = applySrs(doc, new Map([["3", sm2(undefined, 2, NOW)]]));
    const c3 = collectCards(next).find((c) => c.el.id === "3")!;
    expect(c3.el.block.srs?.reps).toBe(1);
    expect(c3.el.block.flipped).toBe(false);
    expect(applySrs(doc, new Map())).toBe(doc);
  });
  it("modo prova zera e conta", () => {
    const doc = normalizeDoc({ version: 1, pages: [{ ...createPage(), elements: [
      block("q", { kind: "quiz", question: "?", options: ["a", "b"], answer: 1, picked: 1, color: "#000000" }),
      block("t", { kind: "tape", revealed: true, label: "", pattern: "solid", color: "#F2B33D" }),
      card("c"),
    ] }] });
    expect(examScore(doc)).toEqual({ quizzes: 1, answered: 1, right: 1, tapes: 1, revealed: 1 });
    const fresh = resetForExam(doc);
    expect(examScore(fresh)).toEqual({ quizzes: 1, answered: 0, right: 0, tapes: 1, revealed: 0 });
    expect(resetForExam(fresh)).toBe(fresh);
  });
  it("estatísticas e sequência de dias", () => {
    let s = addStat({}, NOW, { focus: 25, pomodoros: 1 });
    s = addStat(s, NOW, { reviewed: 10, right: 8 });
    s = addStat(s, NOW - DAY, { focus: 10 });
    const days = lastDays(s, NOW, 7);
    expect(days).toHaveLength(7);
    expect(days[6].s).toEqual({ focus: 25, pomodoros: 1, reviewed: 10, right: 8 });
    expect(streak(s, NOW)).toBe(2);
  });
  it("slides na ordem de leitura (ou pela numeração)", () => {
    const f = (id: string, title: string, x: number, y: number) => ({ id, type: "frame", x, y, w: 100, h: 80, angle: 0, strokeWidth: 1, title, color: "#2F4B8F", tint: 0, rounded: true, opacity: 1 });
    const els = normalizeDoc({ version: 1, pages: [{ ...createPage(), elements: [f("c", "C", 0, 300), f("b", "B", 300, 0), f("a", "A", 0, 10)] }] }).pages[0].elements;
    expect(slideOrder(els).map((e) => e.id)).toEqual(["a", "b", "c"]);
    const nums = normalizeDoc({ version: 1, pages: [{ ...createPage(), elements: [f("x", "2. Fim", 0, 0), f("y", "1. Início", 500, 500)] }] }).pages[0].elements;
    expect(slideOrder(nums).map((e) => e.id)).toEqual(["y", "x"]);
  });
  it("áudio: saneia e sabe o que ainda não foi escrito", () => {
    const recs = cleanRecordings([{ id: "r", data: "data:audio/webm;base64,AAA", marks: [{ id: "s1", at: 1000 }, { id: "s2", at: 5000 }, { lixo: 1 }] }, { id: "x", data: "http://mal" }])!;
    expect(recs).toHaveLength(1);
    expect([...notYetWritten(recs[0], 2000)]).toEqual(["s2"]);
    expect(cleanRecordings([])).toBeUndefined();
  });
});
