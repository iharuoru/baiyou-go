import { describe, expect, it } from "vitest";
import { contours } from "./contour";

/** n × n の格子に、中心 (cx, cy) からの距離が r 以内なら 1、それ以外 0 の値を置く。 */
function disks(n: number, centers: [number, number][], r: number): number[][] {
  return Array.from({ length: n }, (_, j) =>
    Array.from({ length: n }, (_, i) => (centers.some(([cx, cy]) => (i - cx) ** 2 + (j - cy) ** 2 <= r * r) ? 1 : 0)),
  );
}

describe("等高線", () => {
  it("1 つのかたまりは、1 つの閉じた輪郭になり、輪郭の点はかたまりの境目にある", () => {
    const loops = contours(disks(11, [[5, 5]], 3), 1, 0.5);
    expect(loops).toHaveLength(1);
    loops[0]!.forEach(({ x, y }) => {
      const distance = Math.hypot(x - 5, y - 5);
      expect(distance).toBeGreaterThan(2);
      expect(distance).toBeLessThan(4);
    });
  });

  it("離れた 2 つのかたまりは、別々の輪郭になる", () => {
    expect(contours(disks(15, [[3, 7], [11, 7]], 2), 1, 0.5)).toHaveLength(2);
  });

  it("しきい値以上の所がなければ、輪郭はない", () => {
    expect(contours(disks(5, [], 1), 1, 0.5)).toEqual([]);
  });
});
