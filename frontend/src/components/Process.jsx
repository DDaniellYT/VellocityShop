const steps = [
  {
    icon: "▤",
    title: "From Client Idea",
    text: "Send a photo, a rough sketch, an STL file, or just a description of what you need. We'll turn it into a plan from there."
  },
  {
    icon: "✎",
    title: "Processing",
    text: "Every project starts with an accurate 3D model. If you already have an STL, we clean and prep it for printing. If not, we build one from scratch to match your specs.",
  },
  {
    icon: "🖶",
    title: "Printing",
    text: "We choose the right material for the job — weather-resistant, food-safe, high-heat, or standard — and run it on calibrated printers to keep tolerances tight.",
  },
  {
    icon: "◈",
    title: "To Client",
    text: "Each piece is inspected against the original request before it ships. Orders go out with a trusted courier, arriving within 4–8 business days.",
  },
];

export default function Process() {
  return (
    <section className="section" id="work">
      <h2 style={{ marginBottom: 36 }}>How it's made</h2>
      <div className="process-grid">
        {steps.map((step) => (
          <div className="process-card" key={step.title}>
            <div className="process-icon">{step.icon}</div>
            <h4>{step.title}</h4>
            <p>{step.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
