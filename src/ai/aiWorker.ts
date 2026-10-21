// AI の計算を画面と別のスレッドで行い、考えている間も画面 (アニメーション) を止めない。

import type { GameState } from "../game/rules";
import { chooseMove, type AiLevel, type AiMove } from "./chooseMove";

export interface AiRequest {
  readonly id: number;
  readonly state: GameState;
  readonly level: AiLevel;
}

export interface AiResponse {
  readonly id: number;
  readonly move: AiMove;
}

onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, state, level } = event.data;
  const response: AiResponse = { id, move: chooseMove(state, level) };
  postMessage(response);
};
