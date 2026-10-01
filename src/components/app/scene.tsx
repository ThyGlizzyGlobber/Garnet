/**
 * The colour scene behind everything: the Garnet scheme as a soft ground,
 * four slow-drifting colour blobs, film grain and a vignette (globals.css).
 */
export function Scene() {
  return (
    <div className="scene" aria-hidden="true">
      <i className="b1" />
      <i className="b2" />
      <i className="b3" />
      <i className="b4" />
      <i className="grain" />
      <i className="vig" />
    </div>
  );
}
