import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AreaScore } from "../game/score";
import { summarize } from "../game/summary";
import { boardSnapshot } from "./boardSnapshot";

interface Props {
  score: AreaScore;
  /** パネルを開く時刻 (秒)。シリンダーで測り終わってから。 */
  delaySeconds: number;
  onRestart: () => void;
  onClose: () => void;
  onExit: () => void;
}

/** このゲームのページの URL。 */
const pageUrl = () => `${window.location.origin}${window.location.pathname}`;

/**
 * X の投稿画面の URL。スマホの X アプリは twitter.com/intent/tweet を投稿画面として開く (x.com/intent/post はアプリ内
 * ブラウザで開いてしまう)。PC のブラウザでは x.com の投稿画面に転送される。投稿画面には画像を渡せないので、
 * 画像はクリップボードから利用者に貼ってもらう。
 */
const intentUrl = (text: string, url: string) =>
  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

/** 投稿の準備ができた時にモーダルで伝えること。 */
interface PostNotice {
  title: string;
  body: string;
}

/** 盤の画像をクリップボードに写す。写せなければ保存する。利用者に伝えることを返す。 */
async function copyBoardImage(image: Promise<Blob | null>): Promise<PostNotice> {
  // 画像の Promise をそのまま渡す (Safari は、押した操作の中で clipboard.write を呼ばないと写せない)。
  const png = image.then((blob) => blob ?? Promise.reject(new Error("盤の画像を作れませんでした")));
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return {
      title: "画像をコピーしました",
      body: "培養槽の画像をクリップボードにコピーしました。X の投稿画面を開いて、画像を貼り付けてください。",
    };
  } catch {
    const blob = await image;
    if (!blob) return { title: "画像を作れませんでした", body: "画像なしで X の投稿画面を開けます。" };
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "baiyou-go.png";
    link.click();
    URL.revokeObjectURL(link.href);
    return {
      title: "画像を保存しました",
      body: "培養槽の画像を保存しました。X の投稿画面を開いて、画像を添付してください。",
    };
  }
}

/**
 * 終局の結果: シリンダーで測った後に、勝者と差 (ml)、次の操作を出す (それぞれの量はシリンダーの下に出す)。
 * X にポストを押すと、用意している間はくるくる回る印を出してほかを押せなくし、できたらモーダルで伝えて
 * 「X を開く」で本文を入れた投稿画面を開く (投稿画面は押した操作からしか開けず、用意を待つと許可が切れるため)。
 * 用意するのは盤の画像で、クリップボードに写し、投稿画面で利用者に貼ってもらう。
 */
export function ResultPanel({ score, delaySeconds, onRestart, onClose, onExit }: Props) {
  const summary = summarize(score);
  const text = `${summary.postTitle}\n${summary.postDescription}\n#培養碁`;
  // idle は押す前 (モーダルを閉じた後も)、preparing は用意している途中。用意できたらモーダルで伝えること。
  const [post, setPost] = useState<"idle" | "preparing" | PostNotice>("idle");
  const prepare = async () => {
    setPost("preparing");
    // 盤の画像は押した時に写す (パネルを作った時は、盤がまだ終局の形になっていない)。
    // 盤の CSS のアニメーションを止めて写すので、計測の演出の途中でも終局の形になる。
    setPost(await copyBoardImage(boardSnapshot()));
  };
  return (
    <div
      className="result-panel"
      role="dialog"
      aria-label="実験の結果"
      style={{ "--panel-delay": `${delaySeconds}s` } as CSSProperties}
    >
      <p className="result-label">実験終了</p>
      <h2 className={`result-headline ${score.winner}`}>{summary.headline}</h2>
      <p className="result-margin">{summary.margin}</p>
      <div className="result-actions">
        <button onClick={onRestart}>再実験</button>
        <button onClick={onClose}>培養槽を見る</button>
        <button onClick={onExit}>メニュー</button>
        <button className="post-button" onClick={() => void prepare()}>
          X にポスト
        </button>
      </div>
      {/* 用意している間と、できた時のモーダル。パネルの外 (画面全体) に重ねて、ほかを押せなくする */}
      {post === "preparing" &&
        createPortal(
          <div className="post-overlay" role="alert" aria-busy="true">
            <div className="post-busy">
              <span className="post-spinner" aria-hidden="true" />
              <p className="post-wait">準備中…</p>
            </div>
          </div>,
          document.body,
        )}
      {typeof post === "object" &&
        createPortal(
          <div className="post-overlay">
            <div className="post-modal" role="dialog" aria-modal="true" aria-labelledby="post-modal-title">
              <h3 id="post-modal-title" className="post-modal-title">
                {post.title}
              </h3>
              <p className="post-modal-body">{post.body}</p>
              <div className="post-modal-actions">
                <a
                  className="post-button"
                  href={intentUrl(text, pageUrl())}
                  target="_blank"
                  rel="noopener"
                  onClick={() => setPost("idle")}
                >
                  X を開く
                </a>
                <button onClick={() => setPost("idle")}>閉じる</button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
