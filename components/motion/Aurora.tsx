/**
 * Aurora — slow-drifting, blurred light fields (green / white / red signal
 * washes) plus a faint vertical scan-line travelling the page. Sits behind
 * all content as an ambient backdrop. Pure CSS; respects reduced motion via
 * the global media query.
 */
export default function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <div className="aurora-blob aurora-a" />
      <div className="aurora-blob aurora-b" />
      <div className="aurora-blob aurora-c" />
      <div className="aurora-blob aurora-d" />
    </div>
  );
}
