// 盤のスクリーンショット: 画面の盤 (svg.board) を PNG の画像にする。X への投稿に使う。
// SVG を画像として描くと、ページの CSS が効かないので、ページの CSS をすべて SVG の中に写す。アニメーションは止めて、
// 終局の盤面 (陣地の粘液、生命体、触覚、結界、臓器) を最後の形で写し、計測の演出 (暗幕、シリンダー、配管) は写さない。

/** 画像の一辺の画素数。 */
const IMAGE_SIZE = 1080;

/** ページの CSS をすべて文字列にする (読めないシートは飛ばす)。 */
function pageCss(): string {
  return [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");
}

/** 盤を PNG にする。盤が見つからない時や描けない時は null。 */
export async function boardSnapshot(): Promise<Blob | null> {
  const board = document.querySelector<SVGSVGElement>("svg.board");
  if (!board) return null;
  const clone = board.cloneNode(true) as SVGSVGElement;
  // 計測の演出を除き、吸い込みの途中で消える指定 (draining) を外す。
  clone.querySelectorAll(".measurement").forEach((node) => node.remove());
  clone.classList.remove("draining");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(IMAGE_SIZE));
  clone.setAttribute("height", String(IMAGE_SIZE));
  // 画面の背景色と文字の色。CSS 変数はページの :root に定義されているので、写した CSS の中で効く。
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `${pageCss()}\n*, *::before, *::after { animation: none !important; transition: none !important; }`;
  clone.insertBefore(style, clone.firstChild);
  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", getComputedStyle(document.body).backgroundColor || "#070b1e");
  clone.insertBefore(background, style.nextSibling);
  // :root の変数を svg にも写す (画像の中では svg がいちばん外側になるので)。
  clone.setAttribute("style", rootVariables());

  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("盤の画像を読み込めませんでした"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = IMAGE_SIZE;
    canvas.height = IMAGE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** :root に定義された CSS 変数 (--black-body など) を、style 属性の文字列にする。 */
function rootVariables(): string {
  const computed = getComputedStyle(document.documentElement);
  const names = [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules];
      } catch {
        return [];
      }
    })
    .flatMap((rule) => (rule instanceof CSSStyleRule && rule.selectorText === ":root" ? [...rule.style] : []))
    .filter((name) => name.startsWith("--"));
  return [...new Set(names)].map((name) => `${name}: ${computed.getPropertyValue(name)}`).join("; ");
}
