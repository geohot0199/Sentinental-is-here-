const DEFAULT_ITEMS = [
  "01 Inventory",
  "02 Triage",
  "03 Delegate",
  "04 Assess",
  "05 Plan",
  "06 Patch",
  "07 Verify",
  "08 Propose",
  "approval gated",
  "OSV live",
  "TrueForge harness",
];

export default function Marquee({ items = DEFAULT_ITEMS }: { items?: string[] }) {
  const loop = [...items, ...items];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-fade" />
      <div className="marquee-track">
        {loop.map((item, index) => (
          <span className="marquee-item" key={`${item}-${index}`}>
            <em>✳</em> {item}
          </span>
        ))}
      </div>
    </div>
  );
}
