/**
 * The sign-in backdrop: a ledger-grid plane tilted in perspective, whose cells
 * light up under the cursor and fade slowly after it leaves — moving the mouse
 * paints a trail across the ledger. The finance glyphs are static scenery.
 *
 * The grid is real elements rather than a painted background because a
 * background image cannot react to hover. ~2000 empty <i> cells is cheap: no
 * content, no listeners, just CSS :hover.
 *
 * Decorative throughout: aria-hidden, and only the cells take pointer events
 * (the card sits above on its own layer, so nothing interactive is occluded).
 */
const CELLS = Array.from({ length: 2000 });

// [glyph, left%, top%, size px, layer] — a fixed table, not Math.random():
// the scene must not reshuffle between renders.
const GLYPHS = [
  ["$", 7, 76, 30, "near"],
  ["%", 14, 22, 18, "far"],
  ["$", 22, 55, 22, "mid"],
  ["¢", 31, 12, 16, "far"],
  ["↑", 38, 82, 24, "mid"],
  ["$", 55, 14, 32, "near"],
  ["%", 63, 68, 20, "mid"],
  ["$", 71, 30, 15, "far"],
  ["¢", 79, 84, 26, "near"],
  ["↑", 87, 18, 17, "far"],
  ["$", 93, 58, 21, "mid"],
];

export default function LoginBackdrop() {
  return (
    <div className="fxwrap" aria-hidden="true">
      <div className="gridfx">
        <div className="gridfx-plane">
          {CELLS.map((_, i) => <i key={i} />)}
        </div>
      </div>
      {GLYPHS.map(([g, left, top, size, layer], i) => (
        <span key={i} className={`fx fx-${layer}`}
          style={{ left: `${left}%`, top: `${top}%`, fontSize: size }}>
          {g}
        </span>
      ))}
    </div>
  );
}
