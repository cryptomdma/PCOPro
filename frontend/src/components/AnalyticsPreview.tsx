export function AnalyticsPreview() {
  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Analytics</h2>
          <p>Coming soon: focused usage insights for operations.</p>
        </div>
      </header>
      <div className="card card-stack">
        <div>
          <div className="card-title">Planned analytics</div>
          <p className="muted">These views will be built once data capture is stable.</p>
        </div>
        <div>
          <strong>Usage by product</strong>
          <p className="muted">Track consumption over a date range.</p>
        </div>
        <div>
          <strong>Usage by technician</strong>
          <p className="muted">Pivot-style summary per technician and date range.</p>
        </div>
        <div>
          <strong>Filters</strong>
          <p className="muted">Date range, location, technician, product category, product.</p>
        </div>
      </div>
    </section>
  );
}
