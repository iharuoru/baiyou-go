import { useEffect, useMemo, useRef, useState } from "react";
import type { AiMove } from "../ai/chooseMove";
import type { AiRequest, AiResponse } from "../ai/aiWorker";
import type { Stone } from "../game/board";
import {
  inspectPoint,
  isGameOver,
  newGame,
  pass,
  playMove,
  type GameState,
  type IllegalReason,
  type PointInfo,
} from "../game/rules";
import { KOMI, scoreArea } from "../game/score";
import { deadStones } from "../game/shape";
import { STONE_NAME, toMl } from "../game/summary";
import { MEASURE_START, VERDICT_AFTER } from "./EndgameEffects";
import { ExperimentLog, type LogEntry } from "./ExperimentLog";
import { GoBoard, pointName } from "./GoBoard";
import { InfluenceReadout } from "./InfluenceReadout";
import { ResultPanel } from "./ResultPanel";
import type { GameSettings } from "./StartScreen";

/** AI は、直前の手のアニメーション (落下 → 触覚が生える) を見終わるまで打たない (ミリ秒)。 */
const MIN_THINK_MS = 2200;
/**
 * 実験終了の後: 見送り続ける側が自分の番で見送るまでの間と、AI が打つまでの間 (ミリ秒)。
 * AI は見送るまで打ち続けるので (9 路で数十手)、アニメーションを待たずに速く進める。
 */
const AUTO_PASS_MS = 250;
const FINISHING_THINK_MS = 350;

const ILLEGAL_MESSAGE: Record<IllegalReason, string> = {
  occupied: "その点には、すでに生命体がいます。",
  suicide: "触手を伸ばせない点には投下できません (相手を窒息させられる時だけ投下できます)。",
  ko: "吸収した側の触手が居座っていて、すぐには投下し返せません。1 回別の点に投下してください。",
  repeat: "培養槽が以前と同じ配置に戻るので、その点には投下できません。",
  gameOver: "実験は終了しています。",
};

interface Props {
  settings: GameSettings;
  onExit: () => void;
}

export function GameScreen({ settings, onExit }: Props) {
  const vsAi = settings.opponent !== "human";
  // 触覚の色を手番ごとに入れ替えない: AI と打つ時は自分の色、ふたりの時は紫を黄色・緑をピンクに固定する。
  const ally: Stone = vsAi ? settings.human : "black";
  const [history, setHistory] = useState<GameState[]>(() => [newGame(settings.size)]);
  const [hover, setHover] = useState<number | null>(null);
  // 実験のログ。行の id は増やし続ける。
  const startLog = (): LogEntry[] => [{ id: 0, turn: 0, text: `実験を開始しました。培養槽 ${settings.size} × ${settings.size}。` }];
  const [log, setLog] = useState<LogEntry[]>(startLog);
  const logId = useRef(1);
  // 直前の行と同じ文 (同じ点を何度も押した時の警告など) は積まない。
  const addLog = (turn: number, texts: string[], warning = false) =>
    setLog((entries) =>
      texts.reduce(
        (all, text) => (all[all.length - 1]?.text === text ? all : [...all, { id: logId.current++, turn, text, warning }]),
        entries,
      ),
    );
  // 実験終了を押した側。以降、この色の番はすべて見送る (相手は投下を続け、相手も見送ると終わる)。
  const [finishedBy, setFinishedBy] = useState<Stone | null>(null);
  // 今打った石。1 手戻した時に前の石が落ち直さないよう、着手した時だけ設定する。
  const [justPlaced, setJustPlaced] = useState<number | null>(null);
  // 結果のパネルを「盤を見る」で閉じた時の手数。1 手戻すなどで局面が変われば、また開く。
  const [closedAt, setClosedAt] = useState<number | null>(null);
  // 「結果」で開き直した時は、回収の演出をくり返さず、結果のパネルだけをすぐ出す。
  const [reopened, setReopened] = useState(false);

  const state = history[history.length - 1]!;
  const over = isGameOver(state);
  const aiTurn = vsAi && !over && state.toPlay !== settings.human;
  // 終局したら、実質的に死んでいる領域の石 (死に石) を取り除いて数える。
  const score = useMemo(() => (over ? scoreArea(state.board, deadStones(state.board)) : null), [over, state.board]);
  const name = (stone: Stone) =>
    vsAi ? (stone === settings.human ? "実験者" : "制御装置") : STONE_NAME[stone];

  const describe = (info: PointInfo): string => {
    switch (info.kind) {
      case "stone":
        return `${name(info.group.color)}の群れ: ${info.group.stones.length} 体 / 触手 ${info.group.liberties.length} 本`;
      case "move": {
        const take = info.captured.length > 0 ? ` 相手を ${info.captured.length} 体吸収できます。` : "";
        return `ここに投下すると触手 ${info.group.liberties.length} 本。${take}`;
      }
      case "illegal":
        return ILLEGAL_MESSAGE[info.reason];
    }
  };

  const play = (index: number) => {
    const result = playMove(state, index);
    if (!result.ok) {
      // 生命体のいる点を押しただけの時はログに積まない (その群れの様子は入力行に出ている)。
      if (result.reason !== "occupied") addLog(history.length - 1, [ILLEGAL_MESSAGE[result.reason]], true);
      return;
    }
    const taken = result.state.lastCaptured.length;
    addLog(history.length, [
      `${name(state.toPlay)}が ${pointName(settings.size, index)} に投下しました。`,
      ...(taken > 0 ? [`${name(state.toPlay)}が相手を ${taken} 体吸収しました。`] : []),
    ]);
    setJustPlaced(index);
    setHistory([...history, result.state]);
  };

  const doPass = () => {
    const next = pass(state);
    addLog(history.length, [
      `${name(state.toPlay)}が投下を見送りました。`,
      ...(isGameOver(next) ? ["両方の色で続けて投下を見送ったので、実験を終了しました。"] : []),
    ]);
    setHistory([...history, next]);
  };

  // 実験終了: 押した側 (AI と打つ時は自分、ふたりの時は今の手番の色) は、以降の番をすべて見送る。
  const doFinish = () => {
    const side = vsAi ? settings.human : state.toPlay;
    setFinishedBy(side);
    addLog(history.length - 1, [`${name(side)}は、以降の投下をすべて見送ります。`]);
  };

  // 実験終了を押した側の番になったら、少し待って見送る。
  const autoPassing = !over && finishedBy === state.toPlay;
  useEffect(() => {
    if (!autoPassing) return;
    const timer = window.setTimeout(doPass, AUTO_PASS_MS);
    return () => window.clearTimeout(timer);
    // 局面 (state) が変わるたびに、その番で見送るかを決め直す。
  }, [autoPassing, state]);

  // AI の計算は Worker で行う。局面が変わったら古い答えは捨てる。
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  useEffect(() => {
    const worker = new Worker(new URL("../ai/aiWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const applyAiMove = (move: AiMove) => (move === "pass" ? doPass() : play(move));
  useEffect(() => {
    if (!aiTurn) return;
    // 実験終了の後は実験者が見送り続けるので、今の盤で数えて AI の勝ちなら、もう打たずに見送って終える
    // (中国ルールでは AI が打ち続けても AI の点は減らず、実験者の点も増えない)。
    if (finishedBy !== null && scoreArea(state.board, deadStones(state.board)).winner === state.toPlay) {
      const timer = window.setTimeout(doPass, FINISHING_THINK_MS);
      return () => window.clearTimeout(timer);
    }
    const id = ++requestId.current;
    const started = Date.now();
    let timer: number | undefined;
    const worker = workerRef.current!;
    worker.onmessage = (event: MessageEvent<AiResponse>) => {
      if (event.data.id !== requestId.current) return;
      const wait = Math.max(0, (finishedBy ? FINISHING_THINK_MS : MIN_THINK_MS) - (Date.now() - started));
      timer = window.setTimeout(() => applyAiMove(event.data.move), wait);
    };
    const request: AiRequest = { id, state, level: settings.opponent };
    worker.postMessage(request);
    return () => {
      requestId.current++;
      window.clearTimeout(timer);
    };
    // 局面 (state) が変わった時と、実験終了を押した時だけ、AI に聞き直す。
  }, [aiTurn, state, finishedBy]);

  // AI と打つ時は、自分の番まで戻す。
  const undoTarget = (() => {
    let target = history.slice(0, -1);
    if (vsAi) {
      while (target.length > 1 && target[target.length - 1]!.toPlay !== settings.human) {
        target = target.slice(0, -1);
      }
      if (target[target.length - 1]?.toPlay !== settings.human) return null;
    }
    return target.length > 0 ? target : null;
  })();

  // 戻すと、実験終了の見送りもやめて、実験を続ける。
  const handleUndo = () => {
    if (!undoTarget) return;
    setHistory(undoTarget);
    addLog(undoTarget.length - 1, [finishedBy ? "戻しました。実験を続けます。" : "戻しました。"]);
    setFinishedBy(null);
    setJustPlaced(null);
    setReopened(false);
  };

  const handleRestart = () => {
    setHistory([newGame(settings.size)]);
    setLog(startLog());
    setFinishedBy(null);
    setJustPlaced(null);
    setClosedAt(null);
    setReopened(false);
  };

  const canPlay = !aiTurn && !over && !autoPassing;
  const panelOpen = score !== null && closedAt !== history.length;
  const shownHover = canPlay ? hover : null;
  const hint = shownHover === null ? null : describe(inspectPoint(state, shownHover));
  const prompt =
    hint ??
    (over
      ? "実験は終了しています。"
      : autoPassing
        ? `${name(state.toPlay)}は投下を見送っています…`
        : aiTurn
          ? "制御装置が投下する点を計算しています…"
          : "格子の点にカーソルを合わせる (タッチは 1 回タップ) と、投下した後の触手が見えます。");

  return (
    <div className="game">
      <header className="status-bar">
        {/* 最初の画面に戻るボタン (戻る記号) */}
        <button className="home-button" aria-label="最初に戻る" title="最初に戻る" onClick={onExit}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path
              d="M7.5 4 3 8.5 7.5 13M3.5 8.5H12a4.5 4.5 0 0 1 0 9H9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span className="turn">
          {over ? (
            "実験終了"
          ) : (
            <>
              <span className={`chip ${state.toPlay}`} />
              {aiTurn ? "制御装置の番" : `${name(state.toPlay)}の番`}
            </>
          )}
        </span>
        {/* 対局中は取った石の数、終局したらシリンダーで測った量 (ml) */}
        {score ? (
          <span className="captures">
            <span className="chip black small" /> {toMl(score.area.black)} ml{" "}
            <span className="chip white small" /> {toMl(score.area.white + KOMI)} ml
          </span>
        ) : (
          <span className="captures">
            吸収した数 <span className="chip black small" /> {state.captures.black}{" "}
            <span className="chip white small" /> {state.captures.white}
          </span>
        )}
      </header>

      <div className="board-wrap">
        <GoBoard
          state={state}
          hover={shownHover}
          ally={ally}
          canPlay={canPlay}
          justPlaced={justPlaced}
          result={score}
          // 「結果」で開き直した時は、回収の演出をくり返さない。
          measureStart={panelOpen && !reopened ? MEASURE_START : null}
          onHover={setHover}
          onPlay={play}
        />
        {score && panelOpen && (
          <ResultPanel
            score={score}
            delaySeconds={reopened ? 0 : MEASURE_START + VERDICT_AFTER}
            onRestart={handleRestart}
            onClose={() => setClosedAt(history.length)}
            onExit={onExit}
          />
        )}
      </div>

      {/* 盤の外に、見込みの合計 (終局後はシリンダーで測るので出さない) */}
      {!over && <InfluenceReadout board={state.board} />}

      <nav className="controls">
        {score ? (
          <button
            onClick={() => {
              setClosedAt(null);
              setReopened(true);
            }}
            disabled={closedAt !== history.length}
          >
            結果
          </button>
        ) : (
          <>
            <button onClick={doPass} disabled={!canPlay}>
              見送る
            </button>
            <button onClick={doFinish} disabled={finishedBy !== null}>
              実験終了
            </button>
          </>
        )}
        <button onClick={handleUndo} disabled={!undoTarget}>
          戻す
        </button>
      </nav>

      <ExperimentLog entries={log} prompt={prompt} />
    </div>
  );
}
