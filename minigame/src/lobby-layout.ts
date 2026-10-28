/** Virtual 860x500 menu geometry. Rotated tires never enter the name/status lanes. */
export function lobbyCardLayout(count: number) {
  const twoRows = count > 4;
  return {
    columns: Math.min(4, Math.max(1, count)),
    rows: twoRows ? 2 : 1,
    width: 176,
    gap: 18,
    top: twoRows ? 146 : 153,
    rowStep: 100,
    height: twoRows ? 96 : 152,
    carWidth: twoRows ? 72 : 96,
    carY: twoRows ? 27.5 : 49,
    angle: twoRows ? -0.04 : -0.25,
    nameTop: twoRows ? 55 : 99,
    nameHeight: twoRows ? 22 : 26,
    nameY: twoRows ? 66 : 111,
    nameFont: twoRows ? 15 : 16,
    readyY: twoRows ? 86 : 139,
    readyFont: twoRows ? 13 : 15,
  };
}
