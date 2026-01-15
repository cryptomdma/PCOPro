import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export function LoginView() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Sign in</h2>
          <p>Use your PCOPro credentials to continue.</p>
        </div>
      </header>
      {error ? <div className="error-panel">{error}</div> : null}
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>
          Sign in
        </button>
      </form>
    </section>
  );
}
