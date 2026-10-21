// 終局の演出:
// 1. スライムが自分の陣地へ、石から近い順に滲み出して埋め尽くす (Territory)
// 2. 盤を暗くし、盤の下の配管へスライムを吸い込み、配管を通ってシリンダーの上からしずくでボトボト落とす。
//    液面は波打ちながら上がり、臓器や本当の眼があった色は、その部品も落ちて液に浮かぶ。レーザーで測って勝者を出す (Measurement)

import { useEffect, useState, type CSSProperties } from "react";
import { neighbors, type Cell, type Stone } from "../game/board";
import { KOMI, type AreaScore } from "../game/score";
import type { EyeStatus } from "../game/shape";
import { toMl } from "../game/summary";
import { Mouth } from "./Mouth";
import { liquidPath } from "./InfluenceLayer";
import { OOZE_SECONDS } from "./SlimeLayer";

const COLORS: Stone[] = ["black", "white"];

/** 死に石が分解し始める時刻と、分解して粒になるまでの長さ (秒)。 */
export const DECOMPOSE_AT = 0.3;
export const DECOMPOSE_SECONDS = 1.1;
/** 終局してから侵食が始まるまで (秒)。死に石が分解し終わってから。 */
const OOZE_START = DECOMPOSE_AT + DECOMPOSE_SECONDS;
/** 侵食が、石から一番遠い陣地まで広がるのにかける時間 (秒)。 */
const OOZE_SPREAD = 2.4;
/** 計測を始める時刻 (秒)。侵食が終わってから。 */
export const MEASURE_START = OOZE_START + OOZE_SPREAD + OOZE_SECONDS;

// 計測の段取り (計測を始めてからの秒数)。
/** 盤が暗くなり、シリンダーと配管が現れる。 */
const SHOW_TANKS = 0.6;
/** 盤の上のスライムが、下の方から順に配管へ吸い込まれる時刻と長さ。 */
export const DRAIN_AT = 0.6;
export const DRAIN_SECONDS = 1.4;
/** 吸い込みの 1 粒が配管の口まで伸びて入る長さ。 */
const SUCK = 0.6;
/** 粘り気のある液がシリンダーの上の口から垂れ始める時刻と、垂れ続ける長さ、口から液面まで垂れ下がる長さ (部品が落ちる長さも同じ)。 */
const DROPS_AT = 1.8;
const DROPS = 2;
const FALL = 0.55;
/** 部品が液に飛び込んで沈み、浮き上がって落ち着くまでの長さ (秒) と、浮かぶ位置より深く沈む量 (px)。 */
const PART_SINK = 1.3;
const PLUNGE_DEPTH = 34;
/** 配管を液が満たし終える時刻と、落ち終わった後に配管から液が抜ける長さ。 */
const PIPE_FULL_AT = DROPS_AT;
const PIPE_EMPTY = 0.5;
/** コミの分が注がれる時刻と長さ。 */
const KOMI_AT = DROPS_AT + DROPS + FALL;
const KOMI_POUR = 0.6;
/** レーザーが下から上へ走って測る時刻と長さ。 */
const SCAN_AT = KOMI_AT + KOMI_POUR + 0.2;
const SCAN = 1.4;
/** 勝ったシリンダーが光る時刻。結果のパネルもこの時刻に開く。 */
export const VERDICT_AFTER = SCAN_AT + SCAN + 0.2;

interface Point {
  cx: number;
  cy: number;
}

interface BoardProps {
  score: AreaScore;
  cells: readonly Cell[];
  size: number;
  /** 石の半径。 */
  radius: number;
  pos: (index: number) => Point;
}

/** 陣地の空点ごとに、滲み出して現れる時刻。持ち主の石から陣地をたどって近い所ほど早い。 */
function oozeTimes({ score, cells, size }: BoardProps): Map<number, number> {
  const distance = new Map<number, number>();
  const queue: number[] = [];
  cells.forEach((cell, index) => {
    if (cell === null) return;
    distance.set(index, 0);
    queue.push(index);
  });
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    for (const next of neighbors(size, current)) {
      if (cells[next] !== null || distance.has(next) || score.owner[next] !== score.owner[current]) continue;
      distance.set(next, distance.get(current)! + 1);
      queue.push(next);
    }
  }
  const farthest = Math.max(1, ...distance.values());
  const step = OOZE_SPREAD / farthest;
  const times = new Map<number, number>();
  distance.forEach((d, index) => {
    if (d > 0) times.set(index, OOZE_START + (d - 1) * step);
  });
  return times;
}

/** 陣地の粘液が広がる段階の数。段階ごとの輪郭を、前の段階と入れ替えながら広げる。 */
const OOZE_STEPS = 6;

/**
 * 陣地を埋め尽くす粘液: 対局中の勢力と同じ、なめらかな輪郭の半透明の液体 (liquidPath)。持ち主の石から近い陣地から順に、
 * 段階ごとに広がった輪郭へ入れ替わりながら、陣地全体を覆う。
 */
export function Territory(props: BoardProps & { span: number; cell: number }) {
  const { score, cells, size, pos, span, cell } = props;
  const times = oozeTimes(props);
  const last = Math.max(OOZE_START, ...times.values());
  return (
    <>
      {COLORS.map((color) => {
        const points = score.owner.flatMap((owner, index) => (owner === color && cells[index] === null ? [index] : []));
        if (points.length === 0) return null;
        const steps = Array.from({ length: OOZE_STEPS }, (_, k) => OOZE_START + ((last - OOZE_START) * (k + 1)) / OOZE_STEPS);
        return (
          <g key={color} className={`team ${color} territory`}>
            {steps.map((until, k) => {
              // この段階までに現れる陣地と、それにとなり合う持ち主の石を出どころにする。
              const sources = new Map<number, number>();
              points
                .filter((point) => (times.get(point) ?? OOZE_START) <= until)
                .forEach((point) => {
                  sources.set(point, 1);
                  neighbors(size, point).forEach((next) => {
                    if (cells[next] === color) sources.set(next, 1);
                  });
                });
              if (sources.size === 0) return null;
              const appearAt = k === 0 ? OOZE_START : steps[k - 1]!;
              const isLast = k === OOZE_STEPS - 1;
              return (
                <path
                  key={k}
                  d={liquidPath(sources, pos, cell, span)}
                  fillRule="evenodd"
                  className={`influence-pool territory-step${isLast ? " final" : ""}`}
                  style={
                    {
                      "--step-in": `${appearAt}s`,
                      "--step-out": `${until + OOZE_SECONDS * 0.6}s`,
                    } as CSSProperties
                  }
                />
              );
            })}
          </g>
        );
      })}
    </>
  );
}

/** delay 秒待ってから、duration 秒かけて 0 から to まで数え上げる (SVG の text の中でも使える)。 */
function CountUp({ to, delay, duration }: { to: number; delay: number; duration: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now() + delay * 1000;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / (duration * 1000)));
      setValue(Math.round(to * t * 10) / 10);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, delay, duration]);
  return <>{value}</>;
}

/** 結界の部品: 眼の状態と、味方の結界か (縁の色)。 */
export interface EyePart {
  status: EyeStatus;
  isAlly: boolean;
}

/** シリンダーに落ちる部品: 色ごとの二眼の臓器の数と、結界の丸 (盤の上と同じ見た目で落ちる)。 */
export type Parts = Record<Stone, { organs: number; eyes: EyePart[] }>;

/** 触覚の先端の丸: 位置、持ち主の色 (吸い込まれる配管)、味方か (縁の色)、半径。 */
export interface FeelerTip {
  cx: number;
  cy: number;
  color: Stone;
  isAlly: boolean;
  r: number;
}

/** シリンダーに浮かべる触覚の先端の丸の数の上限 (色ごと)。 */
const MAX_FLOATING_TIPS = 6;

/** 部品ごとに同じ置き場所になる乱数 (0〜1)。 */
function seededRandom(seed: number): () => number {
  let state = ((seed + 1) * 2654435761) % 4294967296;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** 涙形のしずく: 中心 (0, 0) の半径 r の丸に、上 (-y) へとがった先が付く。 */
function teardropPath(r: number): string {
  const f = (v: number) => v.toFixed(1);
  return `M 0 ${f(-1.7 * r)} C ${f(0.45 * r)} ${f(-0.9 * r)} ${f(r)} ${f(-0.45 * r)} ${f(r)} 0 A ${f(r)} ${f(r)} 0 0 1 ${f(-r)} 0 C ${f(-r)} ${f(-0.45 * r)} ${f(-0.45 * r)} ${f(-0.9 * r)} 0 ${f(-1.7 * r)} Z`;
}

/** しずくのつや: 丸の左上の小さな楕円。 */
function DropShine({ r }: { r: number }) {
  return <ellipse cx={-r * 0.38} cy={-r * 0.32} rx={r * 0.24} ry={r * 0.36} transform="rotate(25)" className="drop-shine" />;
}

/** 液面の波: 幅 width の 2 倍の長さを、横に流して動かす (シリンダーの中で切り取る)。 */
function wavePath(x: number, y: number, width: number, height: number, depth: number): string {
  const waves = 4;
  const length = (width * 2) / waves;
  const crests = Array.from({ length: waves }, (_, i) => {
    const start = x - width + i * length;
    return `Q ${start + length / 4} ${y - height} ${start + length / 2} ${y} T ${start + length} ${y}`;
  }).join(" ");
  return `M ${x - width} ${y} ${crests} L ${x + width} ${y + depth} L ${x - width} ${y + depth} Z`;
}

/**
 * 計測: 盤を暗くし、合計マスのスライムを盤の下の配管へ吸い込む。配管は盤の横を上ってシリンダーの上の口につながり、
 * 口からしずくがボトボト落ちて、液面が波打ちながら上がる。臓器や本当の眼があった色は、その部品も落ちて液に浮かぶ。
 * 後手にはコミの分を別の層で注ぎ、レーザーで測って、勝った側のシリンダーを光らせる。
 */
export function Measurement({
  score,
  size,
  pos,
  span,
  start,
  parts,
  tips,
}: BoardProps & { span: number; start: number; parts: Parts; tips: readonly FeelerTip[] }) {
  const at = (seconds: number) => `${start + seconds}s`;
  const tankWidth = span * 0.16;
  // 下に結果のパネルが開くので、シリンダーと数値は盤の上寄りに置く。
  const tankHeight = span * 0.46;
  const tankTop = span * 0.1;
  const tankBottom = tankTop + tankHeight;
  const tankX: Record<Stone, number> = { black: span * 0.34, white: span * 0.66 };
  const totals: Record<Stone, number> = { black: score.area.black, white: score.area.white + KOMI };
  // 目盛りの最大。高い方のシリンダーが 9 割ほどまで埋まるようにする。
  const capacity = Math.max(10, Math.ceil((Math.max(totals.black, totals.white) / 0.9) / 10) * 10);
  const level = (amount: number) => (amount / capacity) * tankHeight;
  const ticks = Array.from({ length: capacity / 10 + 1 }, (_, i) => i * 10);
  const highest = Math.max(level(totals.black), level(totals.white));

  // 配管: 盤の下の吸い込み口から、盤の横 (紫は左、緑は右) を上り、シリンダーの上の口まで。
  const pipeY = span - 15;
  const pipeTop = tankTop * 0.35;
  const inletX: Record<Stone, number> = { black: span * 0.38, white: span * 0.62 };
  const sideX: Record<Stone, number> = { black: 14, white: span - 14 };
  const outletY = tankTop - 4;
  const pipePath = (color: Stone) =>
    `M ${inletX[color]} ${pipeY} H ${sideX[color]} V ${pipeTop} H ${tankX[color]} V ${outletY}`;
  // 継ぎ手 (フランジ): 配管の角と途中に、筒を横切る短い板。向きは筒に垂直。
  const flanges = (color: Stone) => [
    { x: sideX[color], y: pipeY, vertical: false },
    { x: sideX[color], y: pipeTop, vertical: false },
    { x: tankX[color], y: pipeTop, vertical: true },
    { x: sideX[color], y: (pipeY + pipeTop) / 2, vertical: true },
    { x: (inletX[color] + sideX[color]) / 2, y: pipeY, vertical: false },
  ];

  // 吸い込み: 合計マスの 1 マスずつが、盤の下の方から順に、自分の色の吸い込み口へ伸びて入る。
  const sucked = score.owner.flatMap((owner, index) => {
    if (!owner) return [];
    const { cx, cy } = pos(index);
    return [
      {
        index,
        owner,
        cx,
        cy,
        dx: inletX[owner] - cx,
        dy: pipeY - cy,
        delay: DRAIN_AT + (1 - cy / span) * (DRAIN_SECONDS - SUCK),
      },
    ];
  });
  // 触覚の先端の丸も、持ち主の配管へ吸い込まれる (触覚の管は根元へ縮んで消える)。
  const suckedTips = tips.map((tip, i) => ({
    ...tip,
    key: i,
    dx: inletX[tip.color] - tip.cx,
    dy: pipeY - tip.cy,
    delay: DRAIN_AT + (1 - tip.cy / span) * (DRAIN_SECONDS - SUCK),
  }));

  return (
    <g className="measurement">
      <rect width={span} height={span} rx={14} className="measure-dim" style={{ animationDelay: at(0) }} />

      {/* 配管: 金属の筒 (暗い外側、光の帯、細いハイライト) と継ぎ手。中を液の粒が流れる */}
      {COLORS.map((color) => (
        <g key={color} className={`pipe team ${color}`} style={{ animationDelay: at(SHOW_TANKS - 0.3) }}>
          <path d={pipePath(color)} className="pipe-shell" />
          <path d={pipePath(color)} className="pipe-band" />
          {/* 中の液: 吸い込み口から満たしながら進み、落ち終わるとノズルの側へ抜ける。満ちている間は表面の光の筋が流れる */}
          <path
            d={pipePath(color)}
            pathLength={1}
            className="pipe-liquid"
            style={{
              animationDelay: `${at(DRAIN_AT + 0.2)}, ${at(DROPS_AT + DROPS)}`,
              animationDuration: `${PIPE_FULL_AT - DRAIN_AT - 0.2}s, ${PIPE_EMPTY}s`,
            }}
          />
          <path
            d={pipePath(color)}
            className="pipe-sheen"
            style={{ animationDelay: `0s, ${at(PIPE_FULL_AT)}`, animationDuration: `0.6s, ${DROPS}s` }}
          />
          <path d={pipePath(color)} className="pipe-gloss" />
          {flanges(color).map(({ x, y, vertical }) => (
            <rect
              key={`${x}-${y}`}
              x={vertical ? x - 9 : x - 2.5}
              y={vertical ? y - 2.5 : y - 9}
              width={vertical ? 18 : 5}
              height={vertical ? 5 : 18}
              rx={1.5}
              className="pipe-flange"
            />
          ))}
          {/* 吸い込み口: 盤の下に開いたラッパ形の口。吐き出し口: シリンダーの上に下向きのノズル */}
          <path
            d={`M ${inletX[color] - 16} ${pipeY - 9} L ${inletX[color] + 16} ${pipeY - 9} L ${inletX[color] + 7} ${pipeY} L ${inletX[color] - 7} ${pipeY} Z`}
            className="pipe-mouth"
          />
          <path
            d={`M ${tankX[color] - 7} ${outletY - 6} L ${tankX[color] + 7} ${outletY - 6} L ${tankX[color] + 4} ${outletY + 3} L ${tankX[color] - 4} ${outletY + 3} Z`}
            className="pipe-mouth"
          />
        </g>
      ))}

      {COLORS.map((color) => {
        const x = tankX[color] - tankWidth / 2;
        const liquid = level(score.area[color]);
        const komi = color === "white" ? level(KOMI) : 0;
        // 垂れる液の柱の太さ。液面は、柱が液面に届いてから垂れ終わるまでの間に上がる。
        const streamWidth = tankWidth * 0.22;
        const fillDelay = DROPS_AT + FALL * 0.8;
        const fillDuration = DROPS - FALL * 0.5;
        // 部品: 臓器、結界の口、触覚の紐と先端の丸。落ちた後は液の中に浮かぶ (置き場所は色ごとに決まった乱数)。液がなければ落とさない。
        const random = seededRandom(color === "black" ? 3 : 7);
        const partList = [
          ...Array.from({ length: parts[color].organs }, () => ({ kind: "organ" as const, isAlly: false })),
          // 結界の口: 本当の眼は大きな口、未確定は小さな口。欠け目は口がないので落とさない。
          ...parts[color].eyes
            .filter(({ status }) => status !== "false")
            .map(({ status, isAlly }) => ({ kind: `eye ${status}` as const, isAlly })),
          ...tips
            .filter((tip) => tip.color === color && liquid > 0)
            .slice(0, MAX_FLOATING_TIPS)
            // 触覚は、紐の部分と先端の丸が別々の部品になって落ちる。
            .flatMap((tip) => [
              { kind: "strand" as const, isAlly: tip.isAlly },
              { kind: "tip" as const, isAlly: tip.isAlly },
            ]),
        ];
        // 部品は、しずくが落ちる間のランダムな時刻に、しずくに混ざって落ちる。
        const partTimes = partList.map(() => DROPS_AT + random() * DROPS * 0.9);
        // 落ち着く位置: シリンダー全体に散らばるよう、高さは液の深さを部品の数で等分した帯に 1 つずつ、順番を混ぜて割り当てる。
        const bands = partList.map((_, k) => k).sort(() => random() - 0.5);
        return (
          <g
            key={color}
            className={`tank team ${color} ${color === score.winner ? "winner" : "loser"}`}
            style={{ animationDelay: `${at(SHOW_TANKS - 0.3)}, ${at(VERDICT_AFTER)}` }}
          >
            <clipPath id={`tank-inside-${color}`}>
              <rect x={x + 3} y={tankTop} width={tankWidth - 6} height={tankHeight - 3} rx={tankWidth * 0.14} />
            </clipPath>
            <g clipPath={`url(#tank-inside-${color})`}>
              {/*
                上の口からダラダラ垂れる粘り気のある液の柱: 口から下へ伸びて液面に届き、太さが揺れながら、こぶになった塊が
                柱を伝って下りていく。垂れ終わると細くなってちぎれ落ちる。液面より下は液体の層に隠れる。
              */}
              {liquid > 0 && (
                <g
                  className="stream-pour"
                  style={{ animationDelay: at(DROPS_AT), animationDuration: `${FALL}s` }}
                >
                  <g className="stream-break" style={{ animationDelay: at(DROPS_AT + DROPS) }}>
                    <line
                      x1={tankX[color]}
                      y1={outletY}
                      x2={tankX[color]}
                      y2={tankBottom}
                      className="stream-core"
                      style={{ "--stream-width": `${streamWidth}px` } as CSSProperties}
                    />
                    <line
                      x1={tankX[color]}
                      y1={outletY}
                      x2={tankX[color]}
                      y2={tankBottom}
                      className="stream-globs"
                      style={{ "--stream-width": `${streamWidth * 1.5}px` } as CSSProperties}
                    />
                    {/* 柱を伝って下りる細かな粒 */}
                    <line
                      x1={tankX[color] - streamWidth * 0.25}
                      y1={outletY}
                      x2={tankX[color] - streamWidth * 0.25}
                      y2={tankBottom}
                      className="stream-specks"
                    />
                    <line
                      x1={tankX[color] + streamWidth * 0.3}
                      y1={outletY}
                      x2={tankX[color] + streamWidth * 0.3}
                      y2={tankBottom}
                      className="stream-specks slow"
                    />
                    <line
                      x1={tankX[color] - streamWidth * 0.22}
                      y1={outletY}
                      x2={tankX[color] - streamWidth * 0.22}
                      y2={tankBottom}
                      className="stream-gloss"
                    />
                  </g>
                </g>
              )}
              {/* 中の液体: 垂れる液が溜まって上がり、表面が波打つ。後手はその上にコミの分が注がれる */}
              <rect
                x={x + 3}
                y={tankBottom - liquid}
                width={tankWidth - 6}
                height={liquid}
                className="tank-liquid"
                style={{ animationDelay: at(fillDelay), animationDuration: `${fillDuration}s` }}
              />
              <g
                className="tank-surface"
                style={
                  {
                    "--rise": `${-liquid}px`,
                    animationDelay: at(fillDelay),
                    animationDuration: `${fillDuration}s`,
                  } as CSSProperties
                }
              >
                <path
                  d={wavePath(tankX[color], tankBottom, tankWidth, 4, 6)}
                  className="tank-wave"
                  // 波 1 つ分ずらすと元の形に戻るので、くり返しても継ぎ目が見えない。
                  style={{ "--wave-length": `${tankWidth / 2}px` } as CSSProperties}
                />
                {/* 垂れた液が液面に積もって盛り上がる所 (垂れている間だけ) */}
                {liquid > 0 && (
                  <ellipse
                    cx={tankX[color]}
                    cy={tankBottom - 1}
                    rx={streamWidth * 1.1}
                    ry={5}
                    className="stream-pile"
                    style={{ animationDelay: `${at(DROPS_AT + FALL)}, 0s`, animationDuration: `${DROPS - FALL + 0.3}s, 0.5s` }}
                  />
                )}
              </g>
              {komi > 0 && (
                <rect
                  x={x + 3}
                  y={tankBottom - liquid - komi}
                  width={tankWidth - 6}
                  height={komi}
                  className="tank-komi"
                  style={{ animationDelay: at(KOMI_AT), animationDuration: `${KOMI_POUR}s` }}
                />
              )}
              {/* 液に浮かぶ部品 */}
              {partList.map(({ kind, isAlly }, i) => {
                const px = x + tankWidth * (0.35 + random() * 0.3);
                // 落ちた時の液面より下に沈む (液面は落ちた時刻の分だけ上がっている)。
                const filled = Math.min(1, (partTimes[i]! + FALL - DROPS_AT) / DROPS);
                const py = tankBottom - Math.max(6, liquid * filled * (0.25 + random() * 0.6));
                // 沈んで浮かんだ後、液面が上がるのに合わせて、シリンダー全体に散らばった位置へ漂っていく。
                const band = (bands[i]! + 0.15 + random() * 0.7) / partList.length;
                const restX = x + tankWidth * (0.2 + random() * 0.6);
                const restY = tankBottom - Math.max(6, liquid * (0.06 + band * 0.86));
                const driftAt = partTimes[i]! + PART_SINK;
                const driftFor = Math.max(0.8, fillDelay + fillDuration - driftAt + 0.4);
                // 液に飛び込んだ勢いで、浮かぶ位置より深く沈んでから浮き上がる (底は越えない)。
                const plunge = Math.max(0, Math.min(PLUNGE_DEPTH, tankBottom - 8 - py));
                // 触覚の紐は、落ちながらくるくる回る向きを部品ごとに変える。
                const spin = (random() - 0.5) * 540;
                return (
                  <g
                    key={i}
                    className={`tank-part ${kind} ${isAlly ? "ally" : "enemy"}`}
                    style={
                      {
                        "--fall": `${py - outletY}px`,
                        "--plunge": `${plunge}px`,
                        "--spin": `${spin}deg`,
                        animationDelay: `${at(partTimes[i]!)}, ${at(partTimes[i]! + PART_SINK)}`,
                      } as CSSProperties
                    }
                  >
                    <g
                      className="tank-part-drift"
                      style={
                        {
                          "--drift-x": `${restX - px}px`,
                          "--drift-y": `${restY - py}px`,
                          animationDelay: at(driftAt),
                          animationDuration: `${driftFor}s`,
                        } as CSSProperties
                      }
                    >
                    {kind === "organ" ? (
                      <>
                        <ellipse cx={px} cy={outletY} rx={7} ry={6} className="part-flesh" />
                        <ellipse cx={px + 1.5} cy={outletY + 1.5} rx={3.5} ry={3} className="part-lobe" />
                      </>
                    ) : kind.startsWith("eye") ? (
                      // 結界の口: 盤の上と同じ見た目。本当の眼は歯の並んだ大きな口、未確定は小さな口。
                      kind === "eye unsettled" ? (
                        <Mouth cx={px} cy={outletY} r={4} phase={i} />
                      ) : (
                        <Mouth
                          cx={px}
                          cy={outletY}
                          r={8}
                          big
                          phase={i}
                        />
                      )
                    ) : (
                      kind === "strand" ? (
                        // 触覚の紐の部分: くねった短い管。落ちながらくるくる回る
                        <g
                          className="part-tentacle"
                          style={{ transformOrigin: `${px}px ${outletY}px`, animationDelay: at(partTimes[i]!) } as CSSProperties}
                        >
                          <path
                            d={`M ${px - 7} ${outletY + 3} C ${px - 3} ${outletY - 4} ${px + 1} ${outletY + 5} ${px + 7} ${outletY - 2}`}
                            className="part-stalk"
                          />
                        </g>
                      ) : (
                        // 触覚の先端の丸
                        <circle cx={px} cy={outletY} r={2.8} className="part-tip" />
                      )
                    )}
                    </g>
                  </g>
                );
              })}
            </g>
            {/* ガラスの筒と目盛り */}
            <rect x={x} y={tankTop} width={tankWidth} height={tankHeight} rx={tankWidth * 0.18} className="tank-glass" />
            {ticks.map((tick) => (
              <g key={tick} className="tank-tick">
                <line
                  x1={x + tankWidth - 8}
                  y1={tankBottom - level(tick)}
                  x2={x + tankWidth}
                  y2={tankBottom - level(tick)}
                />
                {color === "white" && (
                  <text x={x + tankWidth + 6} y={tankBottom - level(tick)}>
                    {toMl(tick)}
                  </text>
                )}
              </g>
            ))}
            {/* 測った値 */}
            <text x={tankX[color]} y={tankBottom + span * 0.07} className="tank-value">
              <CountUp to={toMl(totals[color])} delay={start + SCAN_AT} duration={SCAN} />
              <tspan className="tank-unit"> ml</tspan>
            </text>
            <text x={tankX[color]} y={tankBottom + span * 0.115} className="tank-detail">
              体 {toMl(score.stones[color])} + 範囲 {toMl(score.territory[color])}
              {color === "white" ? ` + 補正 ${toMl(KOMI)}` : ""}
            </text>
          </g>
        );
      })}

      {/* 盤から配管へ吸い込まれるスライム: 下の方から順に、吸い込み口へ伸びて入る */}
      {COLORS.map((color) => (
        <g key={color} className={`team ${color}`}>
          {sucked
            .filter(({ owner }) => owner === color)
            .map(({ index, cx, cy, dx, dy, delay }) => {
              const r = size > 13 ? 6 : 9;
              // 涙形のとがった先を、吸い込み口と逆の向きに向ける (口の方へ引っ張られて伸びる)。
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
              return (
                <g key={index} transform={`translate(${cx} ${cy})`}>
                  <g
                    className="drain-blob"
                    style={
                      {
                        "--dx": `${dx}px`,
                        "--dy": `${dy}px`,
                        animationDelay: at(delay),
                        animationDuration: `${SUCK}s`,
                      } as CSSProperties
                    }
                  >
                    <g transform={`rotate(${angle})`}>
                      <path d={teardropPath(r)} transform="rotate(180)" className="drop-body" />
                      <DropShine r={r} />
                    </g>
                  </g>
                </g>
              );
            })}
        </g>
      ))}

      {/* 配管へ吸い込まれる触覚の先端の丸 */}
      {suckedTips.map(({ key, cx, cy, r, isAlly, dx, dy, delay }) => (
        <g
          key={`tip-${key}`}
          className={`drain-tip ${isAlly ? "ally" : "enemy"}`}
          style={
            {
              "--dx": `${dx}px`,
              "--dy": `${dy}px`,
              animationDelay: at(delay),
              animationDuration: `${SUCK}s`,
            } as CSSProperties
          }
        >
          <circle cx={cx} cy={cy} r={r} className="tip-dot" />
        </g>
      ))}

      {/* 計測のレーザー: 下から、高い方の液面まで走る */}
      <line
        x1={tankX.black - tankWidth * 0.8}
        x2={tankX.white + tankWidth * 0.8}
        y1={tankBottom}
        y2={tankBottom}
        className="scan-laser"
        style={
          { "--scan-height": `${-highest}px`, animationDelay: at(SCAN_AT), animationDuration: `${SCAN}s` } as CSSProperties
        }
      />
    </g>
  );
}

/** 死に石 1 つが分解してできる粒の数。 */
const BITS = 9;

/**
 * 死に石の分解: 実質的に死んでいる領域に置かれた生命体が、ぶつぶつと小さな粒に崩れて散らばる。
 * 粒はそのあと相手の染み出し (半透明) の中に残り、計測の吸い込みでも消えずに残る。
 */
export function Decompose({
  dead,
  cells,
  radius,
  pos,
}: {
  dead: readonly number[];
  cells: readonly Cell[];
  radius: number;
  pos: (index: number) => Point;
}) {
  return (
    <>
      {COLORS.map((color) => (
        <g key={color} className={`team ${color} decompose`}>
          {dead
            .filter((index) => cells[index] === color)
            .flatMap((index) => {
              const { cx, cy } = pos(index);
              let seed = index + 1;
              const random = () => {
                seed = (seed * 9301 + 49297) % 233280;
                return seed / 233280;
              };
              return Array.from({ length: BITS }, (_, k) => {
                const angle = (k / BITS) * 2 * Math.PI + random();
                const distance = radius * (0.35 + random() * 0.7);
                return (
                  <circle
                    key={`${index}-${k}`}
                    cx={cx}
                    cy={cy}
                    r={radius * (0.12 + random() * 0.1)}
                    className="decompose-bit"
                    style={
                      {
                        "--dx": `${Math.cos(angle) * distance}px`,
                        "--dy": `${Math.sin(angle) * distance}px`,
                        "--from": `${radius * 0.9}px`,
                        animationDelay: `${DECOMPOSE_AT + random() * 0.3}s`,
                        animationDuration: `${DECOMPOSE_SECONDS - 0.3}s`,
                      } as CSSProperties
                    }
                  />
                );
              });
            })}
        </g>
      ))}
    </>
  );
}
