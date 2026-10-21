// 実験のログ: ターミナルのような画面に、実験の出来事 (投下・吸収・見送り・投下できない理由など) を 1 行ずつ積み、
// 一番下の入力行に、今の案内 (カーソルを合わせた点の説明、制御装置の計算中など) を点滅するカーソル付きで出す。

import { useEffect, useRef } from "react";

export interface LogEntry {
  readonly id: number;
  /** 何手目の出来事か (行の頭に出す)。 */
  readonly turn: number;
  readonly text: string;
  /** 警告 (投下できない理由など) は色を変える。 */
  readonly warning?: boolean;
}

interface Props {
  entries: readonly LogEntry[];
  /** 入力行に出す今の案内。 */
  prompt: string;
}

export function ExperimentLog({ entries, prompt }: Props) {
  // 新しい行が増えたら、いちばん下まで送る。
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight });
  }, [entries.length]);
  return (
    <section className="experiment-log" aria-label="実験のログ">
      <header className="log-title">EXPERIMENT LOG</header>
      <div className="log-body" ref={body} role="log" aria-live="polite">
        {entries.map((entry) => (
          <p key={entry.id} className={entry.warning ? "log-line warning" : "log-line"}>
            <span className="log-turn">[{String(entry.turn).padStart(3, "0")}]</span> {entry.text}
          </p>
        ))}
      </div>
      <p className="log-prompt">
        <span className="log-caret">&gt;</span> {prompt}
        <span className="log-cursor" aria-hidden="true" />
      </p>
    </section>
  );
}
