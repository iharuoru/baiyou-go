import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { allGroups, neighbors, opponent, type Board, type Stone } from "../game/board";
import { inspectPoint, isGameOver, playMove, type GameState, type PointInfo } from "../game/rules";
import { influence } from "../game/influence";
import type { AreaScore } from "../game/score";
import { BARRIER_RATIO, BarrierWeb, strandRoots, type BarrierStatus } from "./BarrierWeb";
import { CaptureAbsorb } from "./CaptureAbsorb";
import { InfluenceLayer } from "./InfluenceLayer";
import { Organ } from "./Organ";
import { diagonalLinks, eyeStatuses, fights, sealedLiberties, type EyeStatus } from "../game/shape";
import { DRAIN_AT, DRAIN_SECONDS, Decompose, Measurement, Territory, type FeelerTip, type Parts } from "./EndgameEffects";
import { DROP_SECONDS, SlimeLayer } from "./SlimeLayer";

const CELL = 44;
const PAD = 34;
const STONE_R = CELL * 0.46;
const COLORS: Stone[] = ["black", "white"];

/** 座標の文字。囲碁の慣習で I は飛ばす。 */
const COLUMN_LABELS = "ABCDEFGHJKLMNOPQRST";

/** 点の座標の呼び名 (盤の縁の文字と数: 左上が A9)。 */
export const pointName = (size: number, index: number) =>
  `${COLUMN_LABELS[index % size]}${size - Math.floor(index / size)}`;

/**
 * 触覚の先端の位置 (石から呼吸点までの距離に対する割合。石の半径は 0.46)。次を足し合わせ、交点の手前 (0.92) で止める。
 * - 危険度: そこを塞がれると死ぬ呼吸点ほど長い (塞がれた後に残る HP 0 / 1 / 2 / 3 以上)
 * - 逃げ道: 伸びた先で新しく増える呼吸点 (0〜3) が多い、開けた方向ほど長い
 * - 狙われ度: その呼吸点のとなりに相手の石 (0〜3) が多い、塗りに来られやすい所ほど長い
 * - 大きさ: 石の多い (失うものが大きい) グループほど長い
 */
const REACH_BY_DANGER = [0.8, 0.68, 0.6, 0.56];
const feelerReach = (danger: number, gain: number, threats: number, stones: number) =>
  Math.min(0.92, REACH_BY_DANGER[danger]! + 0.05 * gain + 0.06 * threats + 0.02 * Math.min(stones - 1, 4));
/** 触覚の先端の丸の半径。危ない触覚ほど大きい (太さと揺れの速さは styles.css の .feeler.danger-N)。 */
/** 触覚の根元: 石の中心から、スライムの縁で触覚が生える所までの距離。 */
const FEELER_BASE = STONE_R * 0.8;
const TIP_RADIUS_BY_DANGER = [6.5, 5, 3.8, 3];
/** 危険度: その呼吸点を塞がれた後に残る HP (0 = 取られる / 1 = アタリ / 2 / 3 = 3 以上)。 */
const dangerOf = (hp: number) => Math.min(hp - 1, 3);

interface FeelerShape {
  stone: number;
  liberty: number;
  isAlly: boolean;
  danger: number;
  reach: number;
}

const feelerKey = (feeler: FeelerShape) => `${feeler.stone}-${feeler.liberty}`;

/** 盤面のすべての触覚: 石から、となりの呼吸点に向けて伸ばす。 */
function feelersOf(board: Board, ally: Stone): FeelerShape[] {
  return allGroups(board).flatMap((group) => {
    const liberties = new Set(group.liberties);
    // その呼吸点まで伸びたら増える呼吸点の数。伸ばしたい (開けた) 方向ほど多い。
    const gain = (liberty: number) =>
      neighbors(board.size, liberty).filter((next) => board.cells[next] === null && !liberties.has(next)).length;
    // その呼吸点のとなりにいる相手の石の数。塗りに来られやすいほど多い。
    const enemy = opponent(group.color);
    const threats = (liberty: number) =>
      neighbors(board.size, liberty).filter((next) => board.cells[next] === enemy).length;
    return group.stones.flatMap((stone) =>
      neighbors(board.size, stone)
        .filter((next) => liberties.has(next))
        .map((liberty) => ({
          stone,
          liberty,
          isAlly: group.color === ally,
          danger: dangerOf(group.liberties.length),
          reach: feelerReach(dangerOf(group.liberties.length), gain(liberty), threats(liberty), group.stones.length),
        })),
    );
  });
}

/**
 * 二眼: 本当の眼に決まった自分の結界を 2 つ以上持つグループ。相手はどちらの結界にも打てないので、取られない (生き)。
 * 画面では、グループの中に臓器が育つ (Organ)。臓器は、前から臓器のあった石 (keep) がグループにあればそこに置いたまま動かさず、
 * なければ結界の重心に一番近いグループの石に置く。
 */
/**
 * 群れの石だけをたどって、from から to までの最短の道筋 (石の位置の列)。管がスライムの中を通るようにするのに使う。
 */
function pathWithin(size: number, stones: ReadonlySet<number>, from: number, to: number): number[] {
  const previous = new Map<number, number>([[from, from]]);
  const queue = [from];
  for (let i = 0; i < queue.length && !previous.has(to); i++) {
    for (const next of neighbors(size, queue[i]!)) {
      if (!stones.has(next) || previous.has(next)) continue;
      previous.set(next, queue[i]!);
      queue.push(next);
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(previous.get(path[0]!)!);
  return path;
}

function livingGroups(
  board: Board,
  barriers: Map<number, Stone>,
  statuses: ReadonlyMap<number, EyeStatus>,
  keep: ReadonlySet<number>,
): { stone: number; stones: readonly number[]; eyes: number[] }[] {
  const size = board.size;
  return allGroups(board).flatMap((group) => {
    const eyes = group.liberties.filter((liberty) => barriers.get(liberty) === group.color && statuses.get(liberty) === "real");
    if (eyes.length < 2) return [];
    const kept = group.stones.find((stone) => keep.has(stone));
    if (kept !== undefined) return [{ stone: kept, stones: group.stones, eyes }];
    const x = eyes.reduce((sum, eye) => sum + (eye % size), 0) / eyes.length;
    const y = eyes.reduce((sum, eye) => sum + Math.floor(eye / size), 0) / eyes.length;
    const distance = (stone: number) => ((stone % size) - x) ** 2 + (Math.floor(stone / size) - y) ** 2;
    const stone = group.stones.reduce((best, next) => (distance(next) < distance(best) ? next : best));
    return [{ stone, stones: group.stones, eyes }];
  });
}

/** 切断点へ伸びる触覚の先端の位置 (石から切断点までの距離に対する割合)。2 本の先端が、あと少しで触れる所。 */
const STRAIN_REACH = 0.9;
/** 攻め合いとセキで絡む触覚の先端の位置。共有する呼吸点を少し越えて伸び、両側の触覚が紐のように交差する。 */
const TWIST_REACH = 1.18;
/** 攻め合いの触覚が、HP の多い側の石へ引っ張られる量 (呼吸点からその石までの距離に対する割合)。 */
const TUG = 0.06;
/**
 * 攻め合いとセキの触覚の絡み。共有する呼吸点を越えて伸び、相手の触覚と逆向きにうねって紐のように交差する。
 * sign はうねる向き (黒 1 / 白 -1)。
 * 攻め合いは tug の向き (HP の多い側の石) へ引っ張られて揺れ、tug が null (HP が同じ) なら小刻みに震える。
 * セキ (seki) は引っ張られも震えもせず、普通の触覚と同じようにゆらゆら揺れる。
 */
interface Twist {
  sign: 1 | -1;
  tug: { x: number; y: number } | null;
  seki: boolean;
}

/** 絡む触覚を描く点の数。点はなめらかな曲線でつなぐ (smoothPath)。 */
const TWIST_SAMPLES = 16;
/** うねりの幅 (px) と回数。触覚の先の 6 割が、相手の触覚と逆向きにうねって交差する。 */
const TWIST_WIDTH = 6;
const TWIST_TURNS = 1;
const TWIST_FROM = 0.4;

/** 点を順に通る、なめらかな曲線 (Catmull-Rom 曲線を 3 次ベジェ曲線に直したもの)。 */
function smoothPath(points: readonly { x: number; y: number }[]): string {
  const f = (n: number) => n.toFixed(1);
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]!;
  const segments = points.slice(1).map((end, k) => {
    const [before, start, after] = [at(k - 1), at(k), at(k + 2)];
    const c1 = { x: start.x + (end.x - before.x) / 6, y: start.y + (end.y - before.y) / 6 };
    const c2 = { x: end.x - (after.x - start.x) / 6, y: end.y - (after.y - start.y) / 6 };
    return `C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(end.x)} ${f(end.y)}`;
  });
  return `M ${f(points[0]!.x)} ${f(points[0]!.y)} ${segments.join(" ")}`;
}

/** 結界の網の半径。結界へ向かう触覚は、ここで網につながる。 */
const BARRIER_RADIUS = CELL * BARRIER_RATIO;
/** 盤の端の交点から、壁 (モニターの枠) までの距離。端・隅の結界は壁から触手が生える。 */
const WALL_DISTANCE = PAD - 3;
/** 結界へ向かう触覚の先端の位置 (石から呼吸点までの距離に対する割合)。 */
const BARRIER_REACH = 1 - BARRIER_RATIO;

/** 背景の星。盤の大きさごとに同じ配置にする。 */
function backgroundStars(span: number): { x: number; y: number; r: number }[] {
  let seed = span;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return Array.from({ length: Math.round(span / 6) }, () => ({
    x: random() * span,
    y: random() * span,
    r: 0.4 + random() * 1.1,
  }));
}

const STAR_POINTS: Record<number, number[]> = {
  9: [2, 4, 6],
  13: [3, 6, 9],
  19: [3, 9, 15],
};

interface Props {
  state: GameState;
  hover: number | null;
  /** 味方の色。呼吸点の触覚の色分けに使う。 */
  ally: Stone;
  /** 今、盤をクリックして打てるか (AI の番や終局後は打てない)。 */
  canPlay: boolean;
  /** 今打った石。落下アニメーションをする。 */
  justPlaced: number | null;
  /** 終局の数え。あれば、陣地の侵食の演出をする。 */
  result: AreaScore | null;
  /** 合計マスをシリンダーで測る演出を始める時刻 (秒)。null なら測らない (結果のパネルを閉じて盤を見ている時)。 */
  measureStart: number | null;
  onHover: (index: number | null) => void;
  onPlay: (index: number) => void;
}

export function GoBoard({
  state,
  hover,
  ally,
  canPlay,
  justPlaced,
  result,
  measureStart,
  onHover,
  onPlay,
}: Props) {
  const { size, cells } = state.board;
  const span = PAD * 2 + CELL * (size - 1);
  const pos = (index: number) => ({
    cx: PAD + (index % size) * CELL,
    cy: PAD + Math.floor(index / size) * CELL,
  });

  // クリックの直前に押されたのがマウスかタッチか。
  const lastPointer = useRef("mouse");

  // となり合う同じ色の石の組。スライムの橋になる。
  const bridges = useMemo(
    () =>
      cells.flatMap((cell, index) =>
        cell === null
          ? []
          : neighbors(size, index)
              .filter((next) => next > index && cells[next] === cell)
              .map((next) => [index, next] as const),
      ),
    [cells, size],
  );

  // 2×2 に並んだ同じ色の石。スライムの中に穴が開かないよう埋める。
  const squares = useMemo(
    () =>
      cells.flatMap((cell, index) => {
        if (cell === null || index % size === size - 1 || index + size >= cells.length) return [];
        const corners = [index, index + 1, index + size, index + size + 1];
        return corners.every((corner) => cells[corner] === cell) ? [corners] : [];
      }),
    [cells, size],
  );

  // 今の手番が打てない交点 (呼吸点がない / コウ)。
  const forbidden = useMemo(() => {
    if (!canPlay || isGameOver(state)) return [];
    return cells.flatMap((cell, index) => {
      if (cell !== null) return [];
      const info = inspectPoint(state, index);
      return info.kind === "illegal" ? [index] : [];
    });
  }, [state, cells, canPlay]);

  const info: PointInfo | null = hover === null ? null : inspectPoint(state, hover);

  // 呼吸点の触覚: 石から、となりの呼吸点に向けて伸ばす。常にすべての石に出し、味方と敵で色を変える。
  const currentFeelers = useMemo(() => feelersOf(state.board, ally), [state.board, ally]);
  // 空点を選んでいる間は、置いた後の触覚を見せる。なくなる触覚 (lost) は薄く残し、置く石の触覚は予告 (ghost) で出す。
  const previewMove = hover !== null && info?.kind === "move" ? playMove(state, hover) : null;
  const previewFeelers = previewMove?.ok ? feelersOf(previewMove.state.board, ally) : null;
  const previewKeys = new Set((previewFeelers ?? []).map(feelerKey));
  const feelers = previewFeelers ?? currentFeelers;
  const currentBarriers = useMemo(() => sealedLiberties(state.board), [state.board]);
  // 臓器を置いた石。打った後の盤面で決まった臓器の位置を覚え、新しい本当の眼ができても臓器を動かさない (置く前の予告では覚えない)。
  const organStones = useRef<ReadonlySet<number>>(new Set());
  useEffect(() => {
    const placed = livingGroups(state.board, currentBarriers, eyeStatuses(state.board, currentBarriers), organStones.current);
    organStones.current = new Set(placed.map(({ stone }) => stone));
  }, [state.board, currentBarriers]);
  const barriers = previewMove?.ok ? sealedLiberties(previewMove.state.board) : currentBarriers;
  // 終局で死とみなした石 (分解して相手の染み出しに覆われる)。
  const dead = useMemo(() => new Set(result?.dead ?? []), [result]);
  // 結界・眼の状態・二眼・切断点・攻め合い・セキは、置く前の予告中は置いた後の盤面で求める (勢力は予告しない)。
  const shownBoard = previewMove?.ok ? previewMove.state.board : state.board;
  const statuses = eyeStatuses(shownBoard, barriers);
  const living = livingGroups(shownBoard, barriers, statuses, organStones.current);
  // 切断点へ伸びる触覚 (石-切断点)。2 つの石の触覚が、切断点の上でつながろうとする。
  // 自分の結界 (相手が打てない所) にある切断点は、切られないので除く。
  // キーは "石-切断点"、値は相手方の石 (触覚の先端が向かって曲がる先)。
  const straining = new Map(
    diagonalLinks(shownBoard).flatMap(({ a, b, color, cut }) =>
      cut !== null && barriers.get(cut) !== color
        ? [
            [`${a}-${cut}`, b],
            [`${b}-${cut}`, a],
          ]
        : [],
    ),
  );
  // 攻め合いとセキ。
  const { semeais, sekis } = fights(shownBoard);
  /** point のとなりにある、stones のうちの石。 */
  const touching = (stones: readonly number[], point: number) =>
    stones.filter((stone) => neighbors(size, point).includes(stone));
  // 攻め合いとセキ: 共有する呼吸点へ向かう両方の触覚は、呼吸点を越えて逆向きにうねり、紐のように交差して絡む。
  // 攻め合いは HP の多い側 (leader) の石へ引っ張られて揺れ、セキは普通にゆらゆら揺れる。キーは "石-呼吸点"。
  const twistsAt = (black: readonly number[], white: readonly number[], point: number, tug: Twist["tug"], seki: boolean) =>
    [
      ...touching(black, point).map((stone) => [`${stone}-${point}`, { sign: 1, tug, seki }] as const),
      ...touching(white, point).map((stone) => [`${stone}-${point}`, { sign: -1, tug, seki }] as const),
    ] satisfies (readonly [string, Twist])[];
  const twisting = new Map<string, Twist>([
    ...semeais.flatMap(({ black, white, shared, leader }) =>
      shared.flatMap((point) => {
        const pull = leader === null ? null : touching(leader === "black" ? black.stones : white.stones, point)[0]!;
        const tug =
          pull === null
            ? null
            : { x: (pos(pull).cx - pos(point).cx) * TUG, y: (pos(pull).cy - pos(point).cy) * TUG };
        return twistsAt(black.stones, white.stones, point, tug, false);
      }),
    ),
    ...sekis.flatMap(({ black, white, shared }) =>
      shared.flatMap((point) => twistsAt(black.stones, white.stones, point, null, true)),
    ),
  ]);
  // 勢力 (対局中の陣地の見込み)。終局後は実際の陣地を出すので求めない。
  // 勢力は置く前の予告では変えず、打った後の盤面で求める (置いた後に液体がにじんで形を変える)。
  const shownInfluence = useMemo(() => (result ? null : influence(state.board)), [result, state.board]);
  // 終局の計測でシリンダーに落ちる部品: 色ごとの二眼の臓器の数と、結界の丸 (状態ごとの見た目)。
  const endParts: Parts = { black: { organs: 0, eyes: [] }, white: { organs: 0, eyes: [] } };
  living.forEach(({ stone }) => (endParts[shownBoard.cells[stone]!].organs += 1));
  barriers.forEach((color, index) => {
    endParts[color].eyes.push({ status: statuses.get(index)!, isAlly: color === ally });
  });
  // 終局の計測で配管へ吸い込まれる触覚の先端の丸 (触覚の向きに reach だけ進んだ所)。
  // 死に石の触覚は分解して消えるので、回収しない。
  const endTips: FeelerTip[] = feelers.filter(({ stone }) => !dead.has(stone)).map(({ stone, liberty, isAlly, danger, reach }) => {
    const a = pos(stone);
    const b = pos(liberty);
    return {
      cx: a.cx + (b.cx - a.cx) * reach,
      cy: a.cy + (b.cy - a.cy) * reach,
      color: cells[stone]!,
      isAlly,
      r: TIP_RADIUS_BY_DANGER[danger]!,
    };
  });
  // コウで、手番の側がすぐには打てない交点。取ったばかりの側の一時的な結界を張る。
  const koPoint = !result && !isGameOver(state) ? state.koPoint : null;
  // 結界の網: 結界 (眼) と、コウの一時的な結界。
  const webs: { index: number; color: Stone; status: BarrierStatus }[] = [
    ...[...barriers].map(([index, color]) => ({ index, color, status: statuses.get(index)! as BarrierStatus })),
    ...(koPoint !== null && !barriers.has(koPoint)
      ? [{ index: koPoint, color: opponent(state.toPlay), status: "ko" as const }]
      : []),
  ];
  const lostFeelers = previewFeelers ? currentFeelers.filter((feeler) => !previewKeys.has(feelerKey(feeler))) : [];

  const fresh = justPlaced !== null && state.lastMove === justPlaced;
  const retracting = fresh
    ? neighbors(size, justPlaced)
        .filter((next) => cells[next] !== null && next !== justPlaced)
        .map((stone) => ({ stone, isAlly: cells[stone] === ally }))
    : [];

  const stonesWhere = (test: (index: number) => boolean) =>
    cells.flatMap((cell, index) => (cell !== null && test(index) ? [index] : []));
  const shapesWithin = (stones: readonly number[]) => {
    const set = new Set(stones);
    return {
      stones,
      bridges: bridges.filter(([a, b]) => set.has(a) && set.has(b)),
      squares: squares.filter((corners) => corners.every((corner) => set.has(corner))),
    };
  };
  const doomed = new Set(info?.kind === "move" ? info.captured : []);


  // 今の手で取られた石は、粒に崩れて、囲んでいた相手 (取った側) の触覚に吸い込まれる (CaptureAbsorb)。
  const capturer = fresh ? cells[justPlaced]! : null;

  const spaceStars = useMemo(() => backgroundStars(span), [span]);
  const lines = Array.from({ length: size }, (_, i) => PAD + i * CELL);
  const stars = (STAR_POINTS[size] ?? []).flatMap((x) =>
    (STAR_POINTS[size] ?? []).map((y) => ({ x, y })),
  );

  return (
    <svg
      // 終局の計測が始まったら、盤の上のスライムと陣地を、配管へ吸い込まれるのに合わせて消す。
      className={result && measureStart !== null ? "board draining" : "board"}
      style={
        result && measureStart !== null
          ? ({ "--drain-delay": `${measureStart + DRAIN_AT}s`, "--drain-duration": `${DRAIN_SECONDS}s` } as CSSProperties)
          : undefined
      }
      viewBox={`0 0 ${span} ${span}`}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onHover(null);
      }}
      role="grid"
      aria-label={`${size} × ${size} の培養槽`}
    >
      <defs>
        {/* モニターの枠の内側。壁へへばりついたスライムを、枠の角の丸みで切り取る */}
        <clipPath id="screen-clip">
          <rect x={3} y={3} width={span - 6} height={span - 6} rx={12} />
        </clipPath>
        <radialGradient id="screen-glow" cx="50%" cy="45%" r="75%">
          <stop offset="0%" className="screen-center" />
          <stop offset="100%" className="screen-edge" />
        </radialGradient>
        <pattern id="scanlines" width={4} height={4} patternUnits="userSpaceOnUse">
          <rect width={4} height={1.2} className="scanline" />
        </pattern>
        <linearGradient id="sweep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="sweep-clear" />
          <stop offset="100%" className="sweep-light" />
        </linearGradient>
      </defs>

      {/* 戦艦のモニター: 宇宙の背景、ネオンの格子、四隅のブラケット、座標 */}
      <rect width={span} height={span} rx={14} className="screen" />
      {spaceStars.map((star, i) => (
        <circle key={`space-${i}`} cx={star.x} cy={star.y} r={star.r} className="space-star" />
      ))}
      <rect x={3} y={3} width={span - 6} height={span - 6} rx={12} className="screen-frame" />
      {[
        [8, 8, 1, 1],
        [span - 8, 8, -1, 1],
        [8, span - 8, 1, -1],
        [span - 8, span - 8, -1, -1],
      ].map(([x, y, dx, dy]) => (
        <path
          key={`corner-${x}-${y}`}
          d={`M ${x} ${y! + dy! * 18} L ${x} ${y} L ${x! + dx! * 18} ${y}`}
          className="screen-corner"
        />
      ))}

      {/* 格子の光は、フィルターではなく太い半透明の線を下に重ねて出す (フィルターはアニメーションのたびに計算し直して重い) */}
      {["board-glow", "board-line"].map((className) => (
        <g key={className} className={className}>
          {lines.map((p) => (
            <g key={p}>
              <line x1={PAD} y1={p} x2={span - PAD} y2={p} />
              <line x1={p} y1={PAD} x2={p} y2={span - PAD} />
            </g>
          ))}
        </g>
      ))}
      {/* 星。コウの結界 (中心に丸を置かない) の下では、網だけを見せるために出さない */}
      {stars
        .filter(({ x, y }) => koPoint === null || x + y * size !== koPoint)
        .map(({ x, y }) => (
          <circle key={`${x}-${y}`} cx={PAD + x * CELL} cy={PAD + y * CELL} r={3.5} className="star" />
        ))}
      <g className="coord">
        {lines.map((p, i) => (
          <g key={`coord-${i}`}>
            <text x={p} y={PAD / 2 - 2}>
              {COLUMN_LABELS[i]}
            </text>
            <text x={PAD / 2 - 3} y={p}>
              {size - i}
            </text>
          </g>
        ))}
      </g>

      {/* 勢力: スライムから見込みの陣地へ液体が染み出す (見込みの合計は盤の外、GameScreen の InfluenceReadout) */}
      {shownInfluence && (
        <InfluenceLayer
          influence={shownInfluence}
          cells={state.board.cells}
          size={size}
          cell={CELL}
          span={span}
          pos={pos}
          delay={DROP_SECONDS * 0.7}
        />
      )}


      {/*
        終局: 空いた所 (死に石のあった所も) へ、対局中の勢力と同じ半透明の液体で陣地の粘液が染み出す。死に石は小さな粒に
        分解して散らばり、液体の中に残る。結界・触覚・臓器はそのまま残すので、それらより下に敷く
      */}
      {result && (
        <Territory
          score={result}
          cells={cells.map((cell, index) => (dead.has(index) ? null : cell))}
          size={size}
          radius={STONE_R}
          pos={pos}
          span={span}
          cell={CELL}
        />
      )}
      {result && <Decompose dead={result.dead} cells={cells} radius={STONE_R} pos={pos} />}

      {/* 結界: 敵に取られない呼吸点に、囲んだ石の触覚 (端・隅は壁の触手も) から粘菌のように広がる網 */}
      {webs
        .filter(({ index }) => !neighbors(size, index).some((next) => dead.has(next)))
        .map(({ index, color, status }) => {
          const x = index % size;
          const y = Math.floor(index / size);
          const walls = [
            x === size - 1 && 0,
            y === size - 1 && 90,
            x === 0 && 180,
            y === 0 && 270,
          ].filter((angle): angle is number => angle !== false);
          return (
            <BarrierWeb
              key={`barrier-${index}`}
              center={pos(index)}
              radius={BARRIER_RADIUS}
              cell={CELL}
              stoneBase={FEELER_BASE}
              walls={walls}
              wallDistance={WALL_DISTANCE}
              seed={index}
              isAlly={color === ally}
              status={status}
            />
          );
        })}

      {feelers
        .filter(({ stone }) => !dead.has(stone))
        .map(({ stone, liberty, isAlly, danger, reach }) => (
          <Feeler
            key={`feeler-${stone}-${liberty}`}
            from={pos(stone)}
            to={pos(liberty)}
            // 結界 (コウの一時的な結界も) へ向かう触覚は、網の端で止まり、揺れずに網を支える。
            reach={
              barriers.has(liberty)
                ? BARRIER_REACH
                : liberty === koPoint
                  ? BARRIER_REACH
                  : straining.has(`${stone}-${liberty}`)
                    ? STRAIN_REACH
                    : twisting.has(`${stone}-${liberty}`)
                      ? TWIST_REACH
                      : reach
            }
            sealed={barriers.has(liberty) || liberty === koPoint}
            twist={twisting.get(`${stone}-${liberty}`)}
            reachingFor={straining.has(`${stone}-${liberty}`) ? pos(straining.get(`${stone}-${liberty}`)!) : undefined}
            danger={danger}
            isAlly={isAlly}
            seed={stone * 7 + liberty}
            // 今打った石の触覚は、着地してから 1 本ずつ生えてくる。
            motion={stone === hover && previewFeelers ? "ghost" : stone === justPlaced ? "sprout" : undefined}
            order={neighbors(size, stone).indexOf(liberty)}
          />
        ))}
      {lostFeelers.map(({ stone, liberty, isAlly, danger, reach }) => (
        <Feeler
          key={`lost-${stone}-${liberty}`}
          from={pos(stone)}
          to={pos(liberty)}
          reach={reach}
          danger={danger}
          isAlly={isAlly}
          seed={stone * 7 + liberty}
          motion="lost"
        />
      ))}
      {/* 今打った交点へ伸びていた、となりの石の触覚。着地に合わせて縮んで消える */}
      {retracting.map(({ stone, isAlly }) => (
        <Feeler
          key={`retract-${justPlaced}-${stone}`}
          from={pos(stone)}
          to={pos(justPlaced!)}
          reach={feelerReach(2, 0, 0, 1)}
          danger={2}
          isAlly={isAlly}
          seed={stone * 7 + justPlaced!}
          motion="retract"
        />
      ))}

      {/* 打てない交点の ×。結界とコウは網で打てないことが分かるので出さない */}
      {forbidden
        .filter((index) => !barriers.has(index) && index !== state.koPoint)
        .map((index) => {
          const { cx, cy } = pos(index);
          const d = CELL * 0.16;
          return (
            <g key={`ng-${index}`} className="forbidden">
              <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} />
              <line x1={cx - d} y1={cy + d} x2={cx + d} y2={cy - d} />
            </g>
          );
        })}

      {capturer && state.lastCaptured.length > 0 && (
        <CaptureAbsorb
          key={`absorb-${justPlaced}`}
          captured={state.lastCaptured}
          capturer={capturer}
          cells={cells}
          size={size}
          radius={STONE_R}
          pos={pos}
          side={capturer === ally ? "ally" : "enemy"}
        />
      )}

      {/* 色ごとの層。輪郭の層の上に本体の層を重ねて縁取りにする */}
      {COLORS.map((color) => {
        // 死に石は分解して粒になるので、スライムには描かない。
        const shapes = shapesWithin(stonesWhere((index) => cells[index] === color && !dead.has(index)));
        return shapes.stones.length === 0 ? null : (
          // 壁へへばりついた所は、モニターの枠の角の丸みで切り取る。
          <g key={color} className={`team ${color} slime-team`} clipPath="url(#screen-clip)">
            {(["edge", "body"] as const).map((layer) => (
              <SlimeLayer
                key={layer}
                className={layer}
                {...shapes}
                radius={layer === "edge" ? STONE_R : STONE_R - 2}
                pos={pos}
                justPlaced={justPlaced}
                size={size}
                wallDistance={WALL_DISTANCE}
              />
            ))}
          </g>
        );
      })}

      {/* 二眼のグループの中に育つ臓器。石の顔 (つや) の下に描いて、スライムに透けて見せる (終局後も残す) */}
      {living.map(({ stone, stones, eyes }) => {
        // 管: 結界の口に面した石ごとに 1 本。臓器から群れの石だけを最短でたどって (スライムの中を通る) その石まで伸び、
        // 石の縁の手前で、その面から生える触覚と同じ本数に枝分かれして、それぞれの触覚の根元につながる。
        // どの管も臓器からの同じ最短経路の木をたどるので、臓器に近づくと管が重なって 1 本にまとまる。
        const members = new Set(stones);
        const center = pos(stone);
        const links = eyes.flatMap((eye) =>
          neighbors(size, eye)
            .filter((next) => members.has(next))
            .map((root) => {
              const path = pathWithin(size, members, stone, root);
              const a = pos(root);
              const b = pos(eye);
              const fork = {
                cx: a.cx + ((b.cx - a.cx) / CELL) * FEELER_BASE * 0.45,
                cy: a.cy + ((b.cy - a.cy) / CELL) * FEELER_BASE * 0.45,
              };
              return { key: `${eye}-${root}`, points: [...path.map(pos), fork], fan: strandRoots(a, b, FEELER_BASE) };
            }),
        );
        return (
          <Organ
            key={`organ-${stone}`}
            center={center}
            links={links}
            radius={STONE_R * 0.68}
            seed={stone}
          />
        );
      })}

      {/* 石の顔: つや、直前の手の印 */}
      {cells.map((cell, index) => {
        if (!cell || dead.has(index)) return null;
        const { cx, cy } = pos(index);
        const classes = ["stone-face", cell, index === justPlaced ? "drop" : ""].join(" ");
        return (
          <g key={`s-${index}`} className={classes}>
            <ellipse
              cx={cx - STONE_R * 0.38}
              cy={cy - STONE_R * 0.42}
              rx={STONE_R * 0.3}
              ry={STONE_R * 0.16}
              transform={`rotate(-35 ${cx - STONE_R * 0.38} ${cy - STONE_R * 0.42})`}
              className="shine"
            />
            {doomed.has(index) && <circle cx={cx} cy={cy} r={STONE_R + 3} className="doomed-ring" />}
            {state.lastMove === index && (
              <circle cx={cx + STONE_R * 0.52} cy={cy - STONE_R * 0.52} r={3.5} className="last-mark" />
            )}
          </g>
        );
      })}

      {/* 落下地点のマーカー: 回る照準 */}
      {hover !== null && info?.kind === "move" && <DropMarker {...pos(hover)} color={state.toPlay} />}

      {result && measureStart !== null && (
        <Measurement
          score={result}
          cells={cells}
          size={size}
          radius={STONE_R}
          pos={pos}
          span={span}
          start={measureStart}
          parts={endParts}
          tips={endTips}
        />
      )}

      {/* モニターの走査線と、上から下へ流れるスキャンの光 */}
      <rect width={span} height={span} rx={14} fill="url(#scanlines)" className="screen-overlay" />
      <rect width={span} height={span * 0.12} fill="url(#sweep)" className="screen-overlay sweep" />

      {cells.map((_, index) => {
        const { cx, cy } = pos(index);
        return (
          <rect
            key={`hit-${index}`}
            x={cx - CELL / 2}
            y={cy - CELL / 2}
            width={CELL}
            height={CELL}
            className="hit"
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") onHover(index);
            }}
            onPointerDown={(e) => {
              lastPointer.current = e.pointerType;
            }}
            onClick={() => {
              if (!canPlay) return;
              // タッチには hover がないので、1 回目のタップでプレビューし、同じ交点の 2 回目で打つ。
              if (lastPointer.current !== "mouse" && hover !== index) onHover(index);
              else onPlay(index);
            }}
          />
        );
      })}
    </svg>
  );
}

/**
 * 呼吸点の触覚。スライムの縁から呼吸点へ向けて、クネクネと S 字に曲がって伸びる。
 * 先端は交点の手前で止め、別の石から同じ呼吸点へ伸びた触覚と重ならないようにする。
 */
function Feeler({
  from,
  to,
  reach,
  danger,
  sealed = false,
  twist,
  reachingFor,
  isAlly,
  seed,
  motion,
  order = 0,
}: {
  from: { cx: number; cy: number };
  to: { cx: number; cy: number };
  reach: number;
  /** 危険度 (0 = 塞がれると取られる 〜 3 = 安全)。危ないほど太く、先端が大きく、速くもがく。 */
  danger: number;
  /** 結界 (コウの一時的な結界も) を支える触覚。揺れず、先端の丸を出さない (先端は網につながる)。 */
  sealed?: boolean;
  /** 攻め合いとセキの触覚。呼吸点を越えて伸び、相手の触覚と逆向きにうねって交差する (Twist)。 */
  twist?: Twist;
  /**
   * 切断点へ伸びる触覚の、相手方の石 (斜めにならんだ自分の石) の位置。
   * 触覚はその石の触覚とつながろうと、切断点の手前まで伸びて先がその石の側へ少し曲がり、太く小刻みに震える。
   */
  reachingFor?: { cx: number; cy: number };
  isAlly: boolean;
  /** 触覚ごとに、曲がる向きと強さ、ゆらゆらのタイミングを変えるための数。 */
  seed: number;
  /**
   * sprout: 着地の後に根元から生える / retract: 着地に合わせて根元へ引っ込む
   * ghost: 置いたら生える触覚の予告 / lost: 置いたらなくなる触覚
   */
  motion?: "sprout" | "retract" | "ghost" | "lost";
  /** 生える順番。1 本ずつ少し遅らせる。 */
  order?: number;
}) {
  // となりの交点への向き (上下左右のどれか) と、それに垂直な向き。
  const ux = (to.cx - from.cx) / CELL;
  const uy = (to.cy - from.cy) / CELL;
  const nx = -uy;
  const ny = ux;
  const base = FEELER_BASE;
  const length = CELL * reach - base;
  const bend = (seed % 2 === 0 ? 1 : -1) * length * (0.22 + (seed % 3) * 0.08);
  const at = (along: number, side: number) =>
    `${(from.cx + ux * along + nx * side).toFixed(1)} ${(from.cy + uy * along + ny * side).toFixed(1)}`;
  // 切断点へ伸びる触覚は、先が相手方の石の側へ少し曲がる。
  const side = reachingFor ? Math.sign((reachingFor.cx - to.cx) * nx + (reachingFor.cy - to.cy) * ny) : 0;
  const lean = side * CELL * 0.14;
  // 攻め合いとセキの触覚は、普通の S 字に、先の 6 割だけ逆向きのうねりを足した形を点でたどって描く。
  const twistAt = (t: number) => {
    if (!twist || t <= TWIST_FROM) return 0;
    const u = (t - TWIST_FROM) / (1 - TWIST_FROM);
    return twist.sign * TWIST_WIDTH * u * Math.sin(2 * Math.PI * TWIST_TURNS * u);
  };
  // 3 次ベジェ曲線 (制御点の横のずれ bend, -bend) の、t の所の横のずれ。
  const sCurveAt = (t: number) => 3 * t * (1 - t) * (1 - 2 * t) * bend;
  const tipSide = twist ? sCurveAt(1) + twistAt(1) : lean;
  const tipX = from.cx + ux * (base + length) + nx * tipSide;
  const tipY = from.cy + uy * (base + length) + ny * tipSide;
  const stalk = twist
    ? smoothPath(
        Array.from({ length: TWIST_SAMPLES + 1 }, (_, i) => {
          const t = i / TWIST_SAMPLES;
          const side = sCurveAt(t) + twistAt(t);
          return { x: from.cx + ux * (base + length * t) + nx * side, y: from.cy + uy * (base + length * t) + ny * side };
        }),
      )
    : reachingFor
      ? `M ${at(base, 0)} C ${at(base + length * 0.45, -lean * 0.4)} ${at(base + length * 0.8, lean * 0.4)} ${at(base + length, lean)}`
      : `M ${at(base, 0)} C ${at(base + length / 3, bend)} ${at(base + (length * 2) / 3, -bend)} ${at(base + length, 0)}`;
  // 生える触覚は、着地 (落下の 7 割ほど) の後に伸び始める。
  const growDelay = DROP_SECONDS * 0.7 + order * 0.25;
  return (
    <g
      className={["feeler", isAlly ? "ally" : "enemy", `danger-${danger}`, sealed && "sealed", reachingFor && "straining", motion]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          transformOrigin: `${from.cx}px ${from.cy}px`,
          animationDelay: `${-(seed % 10) * 0.15}s`,
          "--grow-delay": `${growDelay}s`,
        } as CSSProperties
      }
    >
      <g
        className={twist && !twist.seki ? `twist-tug${twist.tug ? "" : " even"}` : undefined}
        style={twist?.tug ? ({ "--tug-x": `${twist.tug.x}px`, "--tug-y": `${twist.tug.y}px` } as CSSProperties) : undefined}
      >
        <path d={stalk} pathLength={1} className="feeler-stalk" />
        {!sealed && <circle cx={tipX} cy={tipY} r={TIP_RADIUS_BY_DANGER[danger]} className="feeler-tip" />}
      </g>
    </g>
  );
}

/** 空点を選んだ時の、落下地点のマーカー。 */
function DropMarker({ cx, cy, color }: { cx: number; cy: number; color: Stone }) {
  const ring = STONE_R + 1;
  return (
    <g className={`drop-marker ${color}`}>
      <circle cx={cx} cy={cy} r={ring} className="marker-ring" />
      {[
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ].map(([dx, dy]) => (
        <line
          key={`${dx}-${dy}`}
          x1={cx + dx! * (ring + 3)}
          y1={cy + dy! * (ring + 3)}
          x2={cx + dx! * (ring + 9)}
          y2={cy + dy! * (ring + 9)}
          className="marker-tick"
        />
      ))}
      <circle cx={cx} cy={cy} r={3} className="marker-dot" />
    </g>
  );
}
