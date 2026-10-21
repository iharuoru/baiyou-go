// 遊び方の図: noteFigures.ts の局面を、小さな培養槽として盤 (GoBoard) で描く。押しても投下できない。

import { useMemo } from "react";
import { scoreArea } from "../game/score";
import { deadStones } from "../game/shape";
import { GoBoard } from "./GoBoard";
import { figureState, type FigureSpec } from "./noteFigures";

interface Props {
  figures: readonly { spec: FigureSpec; caption?: string }[];
}

export function NoteFigure({ figures }: Props) {
  return (
    <div className="note-figures">
      {figures.map(({ spec, caption }, i) => (
        <figure key={i} className="note-figure">
          <FigureBoard spec={spec} />
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

function FigureBoard({ spec }: { spec: FigureSpec }) {
  const state = useMemo(() => figureState(spec), [spec]);
  const result = useMemo(
    () => (spec.finished ? scoreArea(state.board, deadStones(state.board)) : null),
    [spec, state],
  );
  return (
    <GoBoard
      state={state}
      hover={null}
      ally="black"
      canPlay={false}
      justPlaced={null}
      result={result}
      measureStart={null}
      onHover={() => {}}
      onPlay={() => {}}
    />
  );
}
