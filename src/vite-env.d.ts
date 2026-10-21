/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** スライムの形。"tension" で表面張力の形、それ以外 (未設定を含む) は丸っぽい形。 */
  readonly VITE_SLIME_SHAPE?: string;
}
