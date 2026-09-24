/** Fixed ambient background: drifting blurred colour blobs, film grain, vignette. */
export function Scene() {
  return (
    <>
      <div className="scene" aria-hidden="true">
        <span className="b1" />
        <span className="b2" />
        <span className="b3" />
        <span className="b4" />
      </div>
      <div className="scene-grain" aria-hidden="true" />
      <div className="scene-vignette" aria-hidden="true" />
    </>
  );
}
