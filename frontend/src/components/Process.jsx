const steps = [
  {
    icon: "▤",
    title: "From Client Idea",
    text: "Whatever you say goes — send a photo, an STL file, a rough idea or even notes scribbled on paper, and we take it from there.",
  },
  {
    icon: "✎",
    title: "Processing",
    text: "From your image I build a sketch with accurate measurements and proportions that read well to the eye. If you already have an STL, I can remesh and clean it up.",
  },
  {
    icon: "🖶",
    title: "Printing",
    text: "I prepare the object for my printers and pick the material for the use case — indoor or outdoor, sunlight or underwater, high temperature or simply sitting on your desk.",
  },
  {
    icon: "◈",
    title: "To Client",
    text: "After printing I go over every part to make sure it matches what you asked for, then package it carefully and ship with trusted couriers — delivery in 4-8 days.",
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
