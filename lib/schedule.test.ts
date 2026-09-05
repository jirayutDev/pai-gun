/**
 * PaiGun — เทสต์การจัดอันดับช่วงวัน
 *
 * ฟิกซ์เจอร์: ช่วง 2026-10-10 ถึง 2026-10-30 (21 วัน), ทริปยาว 3 วัน
 * สถานะของแต่ละคนเขียนเป็นสตริง 21 ตัว index 0 = 2026-10-10
 */

import { describe, expect, it } from "vitest";
import { eachDay } from "./dates";
import {
  personStateInWindow,
  rankWindows,
  STATE_VALUE,
  weightOf,
} from "./schedule";
import type { AvailState, Participant, Trip, TripWindow } from "./types";

const RANGE_START = "2026-10-10";
const RANGE_END = "2026-10-30";
const DAYS = eachDay(RANGE_START, RANGE_END);

const SUBMITTED = "2026-09-01T10:00:00.000Z";

/** แปลงสตริงสถานะ 21 ตัวเป็น days record — ตัว "." หมายถึงไม่ระบุ (ไม่มีคีย์) */
function makePerson(
  name: string,
  isKey: boolean,
  pattern: string,
  submittedAt: string | null = SUBMITTED,
): Participant {
  const days: Record<string, AvailState> = {};
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === ".") continue; // ปล่อยว่าง = ไม่มีคีย์
    days[DAYS[i]] = Number(ch) as AvailState;
  }
  return {
    id: name,
    name,
    token: `tok-${name}`,
    isKey,
    avatarKey: null,
    comment: null,
    days,
    rsvp: null,
    plusOnes: 0,
    submittedAt,
    updatedAt: SUBMITTED,
  };
}

/** [ชื่อ, คนสำคัญ, สถานะ 21 วัน] */
const FIXTURE: [string, boolean, string][] = [
  ["บอส", true, "220100122100122200112"],
  ["เก่ง", false, "110200222000222201001"],
  ["ฟ้า", false, "020211222101122210022"],
  ["ตูน", false, "221100122200022200011"],
  ["มายด์", false, "000102222011222100222"],
  ["แบงค์", false, "110001100000111100111"],
];

/** สร้างคนทั้งหกจากฟิกซ์เจอร์ โดยสั่งให้บางคน "ยังไม่ตอบ" ได้ */
function makeCrew(unanswered: readonly string[] = []): Participant[] {
  return FIXTURE.map(([name, isKey, pattern]) =>
    makePerson(name, isKey, pattern, unanswered.includes(name) ? null : SUBMITTED),
  );
}

function makeTrip(participants: Participant[], lengthDays = 3): Trip {
  return {
    id: "trip-1",
    slug: "abc123",
    ownerId: "user-1",
    title: "เที่ยวเขาใหญ่",
    note: "",
    rangeStart: RANGE_START,
    rangeEnd: RANGE_END,
    lengthDays,
    deadline: null,
    status: "polling",
    lockedStart: null,
    allowSelfJoin: false,
    participants,
    createdAt: SUBMITTED,
  };
}

function findStart(list: readonly TripWindow[], start: string): TripWindow | undefined {
  return list.find((w) => w.start === start);
}

describe("ฟิกซ์เจอร์ 21 วัน ทริป 3 วัน", () => {
  const result = rankWindows(makeTrip(makeCrew()));

  it("ช่วงวันมี 21 วันและวันแรกตรง", () => {
    expect(DAYS).toHaveLength(21);
    expect(DAYS[0]).toBe("2026-10-10");
    expect(DAYS[20]).toBe("2026-10-30");
    // ทุกคนในฟิกซ์เจอร์ต้องระบายครบ 21 วัน
    for (const [, , pattern] of FIXTURE) expect(pattern).toHaveLength(21);
  });

  it("นับคนตอบครบ ไม่มีใครค้าง", () => {
    expect(result.invited).toBe(6);
    expect(result.answered).toBe(6);
    expect(result.waitingFor).toEqual([]);
  });

  it("maxScore = 8 (คนสำคัญ 3 + คนทั่วไป 5)", () => {
    expect(result.windows[0].maxScore).toBe(8);
    for (const w of [...result.windows, ...result.disqualified]) {
      expect(w.maxScore).toBe(8);
    }
  });

  it("ทุกช่วงถูกจัดเข้าพอดีข้างเดียว รวม 19 ช่วง", () => {
    expect(result.windows.length + result.disqualified.length).toBe(19);
  });

  it("อันดับ 1 คือ 23–25 ต.ค. คะแนน 7", () => {
    const top = result.windows[0];
    expect(top.start).toBe("2026-10-23");
    expect(top.end).toBe("2026-10-25");
    expect(top.score).toBe(7);
    expect(top.free).toEqual(["บอส", "เก่ง", "ฟ้า", "ตูน"]);
    expect(top.maybe).toEqual(["มายด์", "แบงค์"]);
    expect(top.busy).toEqual([]);
    expect(top.unknown).toEqual([]);
    expect(top.disqualified).toBe(false);
    expect(top.blockingKeyPeople).toEqual([]);
  });

  it("อันดับ 1 มีวันปิยมหาราช และวันหยุด 3 วัน", () => {
    const top = result.windows[0];
    expect(top.holidays).toContain("วันปิยมหาราช");
    // ศ.23 เป็นวันหยุดราชการ, ส.24 และ อา.25 เป็นเสาร์อาทิตย์
    expect(top.offDays).toBe(3);
  });

  it("ช่วง 24 ต.ค. ถูกตัดออกเพราะบอสไม่ว่าง", () => {
    const dq = findStart(result.disqualified, "2026-10-24");
    expect(dq).toBeDefined();
    expect(dq?.disqualified).toBe(true);
    expect(dq?.blockingKeyPeople).toContain("บอส");
    expect(dq?.busy).toContain("บอส");
    // ช่วงที่ถูกตัดต้องไม่โผล่ในรายการที่ผ่านเกณฑ์
    expect(findStart(result.windows, "2026-10-24")).toBeUndefined();
  });

  it("nearMiss มีช่วง 16–18 ต.ค. ติดแบงค์คนเดียว คะแนน 5", () => {
    const nm = findStart(result.nearMiss, "2026-10-16");
    expect(nm).toBeDefined();
    expect(nm?.end).toBe("2026-10-18");
    expect(nm?.busy).toEqual(["แบงค์"]);
    expect(nm?.score).toBe(5);
    expect(nm?.disqualified).toBe(false);
  });

  it("nearMiss ทุกช่วงติดคนเดียวและไม่ถูกตัดออก", () => {
    for (const w of result.nearMiss) {
      expect(w.busy).toHaveLength(1);
      expect(w.disqualified).toBe(false);
    }
  });

  it("windows เรียงจากดีที่สุด ตาม score → free → offDays → วันต้น ๆ", () => {
    for (let i = 1; i < result.windows.length; i++) {
      const a = result.windows[i - 1];
      const b = result.windows[i];
      const key = (w: TripWindow): [number, number, number, number] => [
        -w.score,
        -w.free.length,
        -w.offDays,
        w.startIndex,
      ];
      const ka = key(a);
      const kb = key(b);
      // ตัวแรกที่ต่างกันต้องบอกว่า a มาก่อน b
      const firstDiff = ka.findIndex((v, idx) => v !== kb[idx]);
      if (firstDiff !== -1) expect(ka[firstDiff]).toBeLessThan(kb[firstDiff]);
    }
  });

  it("disqualified เรียงตามวันในปฏิทิน", () => {
    for (let i = 1; i < result.disqualified.length; i++) {
      expect(result.disqualified[i - 1].startIndex).toBeLessThan(
        result.disqualified[i].startIndex,
      );
    }
  });

  it("ทุกช่วงมี end = start + 2 วัน และคนครบ 6 คนพอดี", () => {
    for (const w of [...result.windows, ...result.disqualified]) {
      expect(DAYS[w.startIndex]).toBe(w.start);
      expect(w.end).toBe(DAYS[w.startIndex + 2]);
      expect(
        w.free.length + w.maybe.length + w.busy.length + w.unknown.length,
      ).toBe(6);
    }
  });
});

describe("คนที่ยังไม่กดบันทึก", () => {
  it("แบงค์ยังไม่ตอบ → เป็น unknown ไม่ใช่ busy จึงหลุดจาก nearMiss", () => {
    const result = rankWindows(makeTrip(makeCrew(["แบงค์"])));

    expect(result.answered).toBe(5);
    expect(result.invited).toBe(6);
    expect(result.waitingFor).toContain("แบงค์");

    // ช่วง 16–18 ต.ค. เดิมติดแบงค์คนเดียว ตอนนี้ไม่มีใคร busy แล้ว
    const w = [...result.windows, ...result.disqualified].find(
      (x) => x.start === "2026-10-16",
    );
    expect(w?.busy).toEqual([]);
    expect(w?.unknown).toEqual(["แบงค์"]);
    // 3 free + 2 maybe + 1 unknown = 3 + 1 + 0.25 = 5.25
    expect(w?.score).toBe(5.25);

    expect(findStart(result.nearMiss, "2026-10-16")).toBeUndefined();
  });

  it("คนสำคัญที่ยังไม่ตอบ ไม่ทำให้ช่วงใดถูกตัดออก", () => {
    const result = rankWindows(makeTrip(makeCrew(["บอส"])));

    expect(result.waitingFor).toEqual(["บอส"]);
    expect(result.answered).toBe(5);
    expect(result.disqualified).toEqual([]);
    expect(result.windows).toHaveLength(19);
    for (const w of result.windows) {
      expect(w.unknown).toContain("บอส");
      expect(w.blockingKeyPeople).toEqual([]);
    }
  });
});

describe("lengthDaysOverride", () => {
  it("ยาว 2 วัน → มี 20 ช่วง", () => {
    const result = rankWindows(makeTrip(makeCrew()), 2);
    expect(result.windows.length + result.disqualified.length).toBe(20);
    for (const w of [...result.windows, ...result.disqualified]) {
      expect(w.end).toBe(DAYS[w.startIndex + 1]);
    }
  });

  it("override ทับค่าใน trip.lengthDays", () => {
    const trip = makeTrip(makeCrew(), 3);
    const five = rankWindows(trip, 5);
    expect(five.windows.length + five.disqualified.length).toBe(17);
    for (const w of [...five.windows, ...five.disqualified]) {
      expect(w.end).toBe(DAYS[w.startIndex + 4]);
    }
    // ไม่ส่ง override → ใช้ 3 วันตามทริป
    const plain = rankWindows(trip);
    expect(plain.windows.length + plain.disqualified.length).toBe(19);
  });

  it("ยาวเท่าช่วงทั้งหมด → เหลือช่วงเดียว", () => {
    const result = rankWindows(makeTrip(makeCrew()), 21);
    expect(result.windows.length + result.disqualified.length).toBe(1);
  });
});

describe("กรณีขอบ", () => {
  it("ทริปยาวกว่าช่วงที่เปิดโหวต → ไม่มีช่วง แต่ข้อมูลคนยังถูกต้อง", () => {
    const result = rankWindows(makeTrip(makeCrew(["แบงค์"])), 30);
    expect(result.windows).toEqual([]);
    expect(result.disqualified).toEqual([]);
    expect(result.nearMiss).toEqual([]);
    expect(result.invited).toBe(6);
    expect(result.answered).toBe(5);
    expect(result.waitingFor).toEqual(["แบงค์"]);
  });

  it("ไม่มีผู้ร่วมเลย → maxScore 0 ทุกช่วงคะแนน 0 ไม่พัง", () => {
    const result = rankWindows(makeTrip([]));
    expect(result.invited).toBe(0);
    expect(result.answered).toBe(0);
    expect(result.waitingFor).toEqual([]);
    expect(result.windows).toHaveLength(19);
    expect(result.nearMiss).toEqual([]);
    for (const w of result.windows) {
      expect(w.maxScore).toBe(0);
      expect(w.score).toBe(0);
      expect(w.free).toEqual([]);
      expect(w.disqualified).toBe(false);
    }
  });

  it("วันที่ไม่มีคีย์ = ไม่ว่าง สำหรับคนที่บันทึกแล้ว", () => {
    // ระบาย 2 ทุกวัน ยกเว้นวัน index 5 ที่ปล่อยว่างไว้
    const p = makePerson("นิด", false, "22222.222222222222222");
    const result = rankWindows(makeTrip([p]));
    // ช่วงที่คลุม index 5 คือ startIndex 3, 4, 5
    for (const s of [3, 4, 5]) {
      const w = result.windows.find((x) => x.startIndex === s);
      expect(w?.busy).toEqual(["นิด"]);
    }
    const clean = result.windows.find((x) => x.startIndex === 6);
    expect(clean?.free).toEqual(["นิด"]);
  });
});

describe("personStateInWindow", () => {
  const crew = makeCrew();

  it("ตรวจตามลำดับ unknown → busy → maybe → free", () => {
    expect(personStateInWindow(makePerson("a", false, "222", null), ["2026-10-10"]))
      .toBe("unknown");
    // ยังไม่ตอบ ต้องเป็น unknown แม้จะมีวัน 0 อยู่ก็ตาม
    expect(
      personStateInWindow(makePerson("a", false, "000", null), DAYS.slice(0, 3)),
    ).toBe("unknown");
    expect(personStateInWindow(makePerson("b", false, "210"), DAYS.slice(0, 3))).toBe("busy");
    expect(personStateInWindow(makePerson("c", false, "221"), DAYS.slice(0, 3))).toBe("maybe");
    expect(personStateInWindow(makePerson("d", false, "222"), DAYS.slice(0, 3))).toBe("free");
  });

  it("ให้ผลตรงกับ rankWindows ทุกช่วงทุกคน", () => {
    const result = rankWindows(makeTrip(crew));
    const all = [...result.windows, ...result.disqualified];
    expect(all).toHaveLength(19);
    for (const w of all) {
      const windowDays = DAYS.slice(w.startIndex, w.startIndex + 3);
      let expected = 0;
      for (const p of crew) {
        const state = personStateInWindow(p, windowDays);
        const bucket =
          state === "free" ? w.free
          : state === "maybe" ? w.maybe
          : state === "busy" ? w.busy
          : w.unknown;
        expect(bucket).toContain(p.name);
        expected += weightOf(p) * STATE_VALUE[state];
      }
      expect(w.score).toBeCloseTo(expected, 10);
    }
  });
});

describe("น้ำหนักและค่าคะแนน", () => {
  it("คนสำคัญหนัก 3 คนทั่วไปหนัก 1", () => {
    expect(weightOf(makePerson("k", true, ""))).toBe(3);
    expect(weightOf(makePerson("n", false, ""))).toBe(1);
  });

  it("ค่าคะแนนตามกฎ", () => {
    expect(STATE_VALUE).toEqual({ free: 1, maybe: 0.5, busy: 0, unknown: 0.25 });
  });
});

describe("ประสิทธิภาพ", () => {
  it("90 วัน × 15 คน คำนวณเสร็จเร็วพอสำหรับพิมพ์สด", () => {
    const start = "2026-01-01";
    const days = eachDay(start, "2026-03-31"); // 90 วัน
    expect(days).toHaveLength(90);
    const people: Participant[] = [];
    for (let k = 0; k < 15; k++) {
      const d: Record<string, AvailState> = {};
      for (let i = 0; i < days.length; i++) {
        d[days[i]] = ((i * 7 + k * 3) % 3) as AvailState;
      }
      people.push({
        id: `p${k}`,
        name: `คน${k}`,
        token: `t${k}`,
        isKey: k === 0,
        avatarKey: null,
        comment: null,
        days: d,
        rsvp: null,
        plusOnes: 0,
        submittedAt: SUBMITTED,
        updatedAt: SUBMITTED,
      });
    }
    const trip: Trip = {
      ...makeTrip(people, 4),
      rangeStart: start,
      rangeEnd: "2026-03-31",
    };

    const t0 = Date.now();
    for (let i = 0; i < 20; i++) rankWindows(trip);
    const elapsed = Date.now() - t0;
    // 20 รอบต้องไม่เกิน 1 วินาที (ปกติเร็วกว่านี้มาก) — กันโค้ดหลุดเป็น O(วัน×คน×ยาว)
    expect(elapsed).toBeLessThan(1000);

    const result = rankWindows(trip);
    expect(result.windows.length + result.disqualified.length).toBe(87);
  });
});
