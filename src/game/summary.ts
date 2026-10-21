// 結果の文: 終局の数え (AreaScore) を、画面と X の投稿に出す文にする。量は ml で示す。

import type { Stone } from "./board";
import { KOMI, type AreaScore } from "./score";

/** 終局で測る液の量: 1 マス (石 1 つ、陣地の空点 1 つ) を何 ml とするか。勝敗も ml で示す。 */
const ML_PER_POINT = 10;
/** マスの数を ml の量に直す (小数の誤差を丸める)。 */
export const toMl = (points: number) => Math.round(points * ML_PER_POINT * 10) / 10;

/** 色の呼び名。 */
export const STONE_NAME: Record<Stone, string> = { black: "紫", white: "緑" };

export interface ResultSummary {
  /** 見出し (紫の支配)。 */
  headline: string;
  /** 差 (紫が 35 ml 多い)。 */
  margin: string;
  /** 合計 (紫 450 ml - 緑 415 ml)。後手にはコミを足す。 */
  totals: string;
  /** X の投稿文の見出し (培養碁の実験終了: 紫の支配)。 */
  postTitle: string;
  /** X の投稿文の説明 (紫が 35 ml 多く支配 (紫 450 ml - 緑 415 ml))。 */
  postDescription: string;
}

export function summarize(score: AreaScore): ResultSummary {
  const winner = STONE_NAME[score.winner];
  const headline = `${winner}の支配`;
  const totals = `紫 ${toMl(score.area.black)} ml - 緑 ${toMl(score.area.white + KOMI)} ml`;
  return {
    headline,
    margin: `${winner}が ${toMl(score.margin)} ml 多い`,
    totals,
    postTitle: `培養碁の実験終了: ${headline}`,
    postDescription: `${winner}が ${toMl(score.margin)} ml 多く支配 (${totals})`,
  };
}
