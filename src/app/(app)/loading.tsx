/** While a page's numbers load: the shape of a page, shimmering. */
export default function Loading() {
  return (
    <div className="loading-page" aria-busy="true">
      <i style={{ height: 56, width: '40%' }} />
      <i style={{ height: 140 }} />
      <i style={{ height: 96 }} />
      <i style={{ height: 96 }} />
    </div>
  );
}
