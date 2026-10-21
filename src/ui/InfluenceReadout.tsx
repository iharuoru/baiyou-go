// 見込みの計器: 盤の外に、紫と緑の見込みの合計 (石 + 勢力の空点、緑にはコミ) と、その割合の帯を出す。
// 盤の液体が入れ替わるのに合わせて、数と帯がゆっくり変わる。

import type { CSSProperties } from "react";
import type { Board } from "../game/board";
import { influence } from "../game/influence";
import { SeepingNumber } from "./InfluenceLayer";
import { DROP_SECONDS } from "./SlimeLayer";

/** 数が変わり始めるまで (置いた石が着地して、液体が入れ替わり始める時) と、変わる長さ (秒)。 */
const SEEP_DELAY = DROP_SECONDS * 0.7;
const SEEP_SECONDS = 1.6;

export function InfluenceReadout({ board }: { board: Board }) {
  const { black, white } = influence(board).total;
  const share = black + white > 0 ? black / (black + white) : 0.5;
  return (
    <div className="influence-readout" aria-label="見込み">
      <span className="readout-label">見込み</span>
      <span className="readout-value black">
        紫 <SeepingNumber value={black} delay={SEEP_DELAY} duration={SEEP_SECONDS} />
      </span>
      <span
        className="readout-bar"
        style={{ "--share": share, "--seep-delay": `${SEEP_DELAY}s`, "--seep": `${SEEP_SECONDS}s` } as CSSProperties}
      />
      <span className="readout-value white">
        緑 <SeepingNumber value={white} delay={SEEP_DELAY} duration={SEEP_SECONDS} />
      </span>
    </div>
  );
}
