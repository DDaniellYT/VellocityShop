import { Link } from "react-router-dom";

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-content">
        <span className="badge">3D DESIGN STUDIO</span>
        <h1>Objects that begin as geometry</h1>
        <p>
          A working archive of my 3D prints — 
        </p>
        <div className="hero-actions">
          <Link to="/#products" className="btn btn-primary">
            Shop the prints →
          </Link>
          <Link to="/?view=work#products" className="btn btn-outline">
            See the work
          </Link>
        </div>
      </div>
    </section>
  );
}