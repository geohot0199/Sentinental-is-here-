/**
 * Aurora — slow-drifting blurred washes behind everything. They are ink on
 * paper at 3–5% opacity, not colour: the page reads as a printed sheet with a
 * faint atmosphere, and the atmosphere is what moves. Pure CSS; the global
 * reduced-motion query stills it.
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
