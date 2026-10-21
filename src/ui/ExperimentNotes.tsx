// 実験の記録: 遠い星の生命体を培養して競わせる実験の形で、遊び方を書く。囲碁の用語は使わない。
// 実験方法 (手順・結果の判定。目的はスタート画面のタイトルの下) と、観察結果 (生命体のふるまい = 盤の表示の意味) に分ける。
// 項目ごとに、その状況を再現した小さな培養槽の図 (NoteFigure、局面は noteFigures.ts) を添える。
// 文は 1〜2 文ごとに改行し、色の名前は色で、盤に出る見た目 (触手・口など) は水色、操作は太字、数は黄色で目立たせる。

import type { ReactNode } from "react";
import { KOMI } from "../game/score";
import { toMl } from "../game/summary";
import { NoteFigure } from "./NoteFigure";
import { METHOD_FIGURES as M, OBSERVATION_FIGURES as O, type FigureSpec } from "./noteFigures";

/** 紫・緑の色の名前。 */
const Purple = () => <span className="tx-black">紫</span>;
const Green = () => <span className="tx-white">緑</span>;
/** 盤に出る見た目 (触手・口・臓器など)。 */
const Key = ({ children }: { children: ReactNode }) => <span className="tx-key">{children}</span>;
/** 実験者の操作 (投下・見送り)。 */
const Act = ({ children }: { children: ReactNode }) => <strong className="tx-act">{children}</strong>;
/** 数。 */
const Num = ({ children }: { children: ReactNode }) => <span className="tx-num">{children}</span>;

/** 項目: 1〜2 文ごとの行と、あれば図。広い画面では図を文の横に並べる。 */
function Item({ lines, figures }: { lines: ReactNode[]; figures?: { spec: FigureSpec; caption?: string }[] }) {
  return (
    <li className="note-item">
      <div className="note-text">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      {figures && <NoteFigure figures={figures} />}
    </li>
  );
}

/** 実験方法: 手順・結果の判定。 */
export function ExperimentMethod() {
  return (
    <div className="field-notes">
      <section>
        <h3 className="notes-heading">手順</h3>
        <ol>
          <Item
            lines={[
              <>
                実験者は <Purple /> か <Green /> のどちらかを担当する。
              </>,
              <>
                担当した色の生命体を、格子の交わる点に 1 体ずつ<Act>投下</Act>する。もう一方の色は、培養槽の制御装置が投下する。
              </>,
              <>
                <Purple /> が先に投下し、以後は交互に投下する。
              </>,
            ]}
          />
          <Item
            lines={[
              <>
                投下した生命体は、となりの空いた点へ<Key>触手</Key>を伸ばし、その先で大気を吸って呼吸する。
              </>,
              <>触手は肥大化した DNA と考えられる。</>,
            ]}
            figures={[{ spec: M.feelers }]}
          />
          <Item
            lines={[
              <>触手を伸ばせない点には投下できない。</>,
              <>ただし、投下によって相手を窒息させられる点には投下できる。</>,
              <>培養槽が以前と同じ配置に戻る点にも投下できない。</>,
            ]}
          />
          <Item
            lines={[
              <>
                これ以上投下しても担当の色の支配が広がらないと判断したら、その回の投下を<Act>見送る</Act>。
              </>,
              <>両方の色で続けて投下を見送った時点で、実験を終了する。</>,
            ]}
          />
        </ol>
      </section>

      <section>
        <h3 className="notes-heading">結果の判定</h3>
        <ol className="plain">
          <Item
            lines={[
              <>
                実験終了の時点で、培養槽の<Key>生命維持を解除</Key>する。
              </>,
              <>
                生命維持を失った生命体は、支配していた範囲へ一斉に<Key>染み出す</Key>。
              </>,
              <>
                相手の範囲に取り残され、もう生き延びられない生命体は、<Key>小さな粒</Key>に分解して相手の染み出しに覆われる。
              </>,
              <>そのあと各色の生命体を配管で回収してシリンダーに集め、体と染み出した量を合わせて測定する。</>,
              <>
                後から投下した <Green /> には、補正として <Num>{toMl(KOMI)} ml</Num> を加える。
              </>,
              <>
                測定した量の多い色を、<Key>より強力な種</Key>と判定する。
              </>,
            ]}
            figures={[{ spec: M.finished }]}
          />
        </ol>
      </section>
    </div>
  );
}

/** 観察結果: 生命体のふるまい (盤に出る表示の意味)。 */
export function ObservationResults() {
  return (
    <div className="field-notes">
      <ol>
        <Item
          lines={[
            <>
              同じ色の個体がとなり合うと、溶け合って 1 つの<Key>群れ</Key>になり、触手を共有する。
            </>,
          ]}
          figures={[{ spec: O.merge }]}
        />
        <Item
          lines={[
            <>触手を伸ばせる場所をすべて相手にふさがれた群れは、窒息して溶け、相手に吸収される。</>,
            <>
              窒息が近づくほど、<Key>触手は長く太く</Key>なってもがく。
            </>,
          ]}
          figures={[{ spec: O.atari }]}
        />
        <Item
          lines={[
            <>群れが集まると、個体どうしが触手を伸ばして絡め合い、</>,
            <>
              やがて中心に<Key>歯の並んだ口</Key>を形成する。口の中には、相手は入り込めない。
            </>,
          ]}
          figures={[{ spec: O.mouth }]}
        />
        <Item
          lines={[
            <>
              <Num>口を 2 つ</Num>形成した群れは、体の内部に<Key>臓器</Key>を育て始め、臓器から口へ管を伸ばす。
            </>,
            <>この状態になった群れは、以後吸収されない。</>,
          ]}
          figures={[{ spec: O.organ }]}
        />
        <Item
          lines={[
            <>
              群れの隙間がまだ埋まりきっていない間は、絡めた触手がゆるみ、<Key>口も小さい</Key>ままである。
            </>,
            <>隙間に相手が入り込むと、口は形成されない。</>,
          ]}
          figures={[
            { spec: O.gap, caption: "隙間が残る" },
            { spec: O.broken, caption: "相手が入り込む" },
          ]}
        />
        <Item
          lines={[
            <>
              吸収が起きた直後の場所では、吸収した側の触手が一時的に絡み合って<Key>居座り</Key>、相手はすぐには投下し返せない。
            </>,
            <>相手が 1 回別の点に投下すると、触手はほどける。</>,
          ]}
          figures={[{ spec: O.ko }]}
        />
        <Item
          lines={[
            <>
              相手の群れと呼吸の場所を奪い合う時、双方の<Key>触手が交差して絡み合い</Key>、引っ張り合う。
            </>,
            <>引っ張っている側が優勢である。</>,
            <>絡んだまま穏やかに揺れる場合は、互いに手出しできず共存する。</>,
          ]}
          figures={[{ spec: O.race }]}
        />
        <Item
          lines={[
            <>
              斜めにならんだ個体どうしは、間の点へ触手を伸ばして<Key>つながろうと震える</Key>。
            </>,
            <>そこへ相手が投下すると、群れは分断される。</>,
          ]}
          figures={[{ spec: O.diagonal }]}
        />
        <Item
          lines={[
            <>
              群れからは薄い<Key>液体</Key>が染み出し、やがて支配しそうな範囲へ広がっていく。
            </>,
          ]}
          figures={[{ spec: O.seep }]}
        />
      </ol>
    </div>
  );
}
