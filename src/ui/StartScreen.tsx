import { useState } from "react";
import type { AiLevel } from "../ai/chooseMove";
import type { Stone } from "../game/board";
import { ExperimentMethod, ObservationResults } from "./ExperimentNotes";

export type Opponent = AiLevel | "human";

export interface GameSettings {
  readonly size: number;
  readonly opponent: Opponent;
  /** AI と打つ時の自分の色。ふたりで打つ時は使わない。 */
  readonly human: Stone;
}

interface Option<T> {
  readonly value: T;
  readonly label: string;
}

const OPPONENTS: Option<Opponent>[] = [
  { value: "easy", label: "制御装置 弱" },
  { value: "normal", label: "制御装置 中" },
  { value: "hard", label: "制御装置 強" },
  { value: "human", label: "実験者 2 名" },
];

const COLORS: Option<Stone>[] = [
  { value: "black", label: "紫 (先に投下)" },
  { value: "white", label: "緑 (後に投下)" },
];

const SIZES: Option<number>[] = [9, 13, 19].map((size) => ({ value: size, label: `${size} × ${size}` }));

function Choice<T>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="choice">
      <span className="choice-label">{label}</span>
      <div className="choice-options" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.label}
            role="radio"
            aria-checked={option.value === value}
            className={option.value === value ? "selected" : undefined}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  initial: GameSettings;
  onStart: (settings: GameSettings) => void;
}

export function StartScreen({ initial, onStart }: Props) {
  const [settings, setSettings] = useState(initial);
  // 遊び方の欄は、開いている間だけ中身 (図の培養槽) を描く。
  const [openNotes, setOpenNotes] = useState({ method: false, observation: false });
  const update = (patch: Partial<GameSettings>) => setSettings({ ...settings, ...patch });

  return (
    <div className="start">
      <h1>培養碁</h1>
      {/* 実験の目的: タイトルの下に、何をする実験か */}
      <section className="purpose">
        <h2 className="purpose-label">実験の目的</h2>
        <p>
          遠い星で採取された <span className="tx-black">紫</span> と <span className="tx-white">緑</span> の 2
          種の生命体は、ほかの個体を吸収して取り込む能力をもつ。
        </p>
        <p>より強力な種を選別するため、格子を刻んだ培養槽で 2 種を競わせ、どちらが培養槽を広く支配するかを調べる。</p>
      </section>

      {/* 今回の実験: 相手の制御・担当する色・培養槽を選んで始める計器のパネル (折り畳まない) */}
      <section className="setup-panel" aria-labelledby="setup-title">
        <h2 id="setup-title" className="setup-title">
          今回の実験
        </h2>
        <Choice
          label="相手の制御"
          options={OPPONENTS}
          value={settings.opponent}
          onChange={(opponent) => update({ opponent })}
        />
        {settings.opponent !== "human" && (
          <Choice label="担当する色" options={COLORS} value={settings.human} onChange={(human) => update({ human })} />
        )}
        <Choice label="培養槽" options={SIZES} value={settings.size} onChange={(size) => update({ size })} />

        <button className="start-button" onClick={() => onStart(settings)}>
          実験開始
        </button>
      </section>

      <details
        className="rules"
        onToggle={(event) => {
          const method = event.currentTarget.open;
          setOpenNotes((open) => ({ ...open, method }));
        }}
      >
        <summary>実験方法</summary>
        {openNotes.method && <ExperimentMethod />}
      </details>

      <details
        className="rules"
        onToggle={(event) => {
          const observation = event.currentTarget.open;
          setOpenNotes((open) => ({ ...open, observation }));
        }}
      >
        <summary>観察結果</summary>
        {openNotes.observation && <ObservationResults />}
      </details>
    </div>
  );
}
