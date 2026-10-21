import { useState } from "react";
import { GameScreen } from "./GameScreen";
import { StartScreen, type GameSettings } from "./StartScreen";

const DEFAULT_SETTINGS: GameSettings = { size: 9, opponent: "normal", human: "black" };

export function App() {
  // 前回の設定をスタート画面の初期値にする。
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [playing, setPlaying] = useState(false);

  if (playing) return <GameScreen settings={settings} onExit={() => setPlaying(false)} />;
  return (
    <StartScreen
      initial={settings}
      onStart={(next) => {
        setSettings(next);
        setPlaying(true);
      }}
    />
  );
}
