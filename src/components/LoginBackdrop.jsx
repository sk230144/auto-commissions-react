/**
 * Floating finance glyphs behind the sign-in card, in three parallax layers —
 * the far layer is smaller, blurred and slower, which is what gives the scene
 * depth. Purely decorative (aria-hidden), pointer-transparent, and killed
 * wholesale by the app's prefers-reduced-motion rule.
 *
 * The set is a fixed table, not Math.random(): the scene must not reshuffle on
 * every render, and two people looking at the same screen should see the same
 * screen.
 */
const GLYPHS = [
  // [glyph, left%, size px, duration s, delay s, layer]
  ["$", 6, 30, 26, 0, "near"],
  ["%", 15, 18, 34, -12, "far"],
  ["$", 24, 22, 30, -22, "mid"],
  ["¢", 33, 16, 38, -5, "far"],
  ["↑", 41, 24, 28, -17, "mid"],
  ["$", 52, 34, 24, -9, "near"],
  ["%", 61, 20, 33, -26, "mid"],
  ["$", 70, 15, 40, -2, "far"],
  ["¢", 78, 26, 27, -14, "near"],
  ["↑", 86, 17, 36, -30, "far"],
  ["$", 93, 21, 31, -20, "mid"],
];

export default function LoginBackdrop() {
  return (
    <div className="fxwrap" aria-hidden="true">
      {GLYPHS.map(([g, left, size, dur, delay, layer], i) => (
        <span key={i} className={`fx fx-${layer}`}
          style={{ left: `${left}%`, fontSize: size, animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
          {g}
        </span>
      ))}
    </div>
  );
}
