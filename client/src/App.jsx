import { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setHealth(data))
      .catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <main className="shell">
      <h1>Prompt Arena: Mystery</h1>
      <p className="tagline">One case. Seventy teams. Three hours.</p>
      <p className="status">
        {health ? (health.ok ? 'API online' : 'API unreachable') : 'checking API...'}
      </p>
      <p className="note">Event build in progress — 3D rooms and interrogation come next.</p>
    </main>
  );
}
