import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type TransferDirection = 'ISSUE' | 'RETURN';
type TransferRequestStatus = 'OPEN' | 'SUBMITTED' | 'FINALIZED' | 'ACK_PENDING' | 'ACKNOWLEDGED' | 'REJECTED' | 'CANCELED' | 'DISPUTED';

type TransferRequestLine = { productId: string; quantity: number; unitLabel: string };
type TransferRequest = {
  id: string;
  technicianId: string;
  direction: TransferDirection;
  status: TransferRequestStatus;
  reason?: string;
  createdAt: string;
  finalizedAt?: string;
  acknowledgedAt?: string;
  disputeNote?: string;
  _count?: { lines: number };
};

type LoginResponse = { token: string; user: { id: string; email: string; role: string; technicianId?: string } };

const loadToken = () => localStorage.getItem('authToken') || '';
const persistToken = (token: string) => localStorage.setItem('authToken', token);
const applyToken = (token: string) => {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
};

export function TransferRequestsView() {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [user, setUser] = useState<LoginResponse['user'] | null>(null);
  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [direction, setDirection] = useState<TransferDirection>('ISSUE');
  const [technicianId, setTechnicianId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<TransferRequestLine[]>([{ productId: '', quantity: 1, unitLabel: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = loadToken();
    if (token) {
      applyToken(token);
      setUser({ id: 'cached', email: '', role: '', technicianId: undefined });
    }
  }, []);

  const refresh = () => {
    axios
      .get<TransferRequest[]>('/api/v1/transfer-requests')
      .then((res) => setRequests(res.data))
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load requests'));
  };

  useEffect(() => {
    refresh();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await axios.post<LoginResponse>('/api/v1/auth/login', { email: loginEmail, password: loginPassword });
      applyToken(res.data.token);
      persistToken(res.data.token);
      setUser(res.data.user);
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Login failed');
    }
  }

  function updateLine(index: number, patch: Partial<TransferRequestLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: '', quantity: 1, unitLabel: '' }]);
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await axios.post('/api/v1/transfer-requests', { direction, technicianId, reason, lines });
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create request');
    }
  }

  async function finalize(id: string) {
    setError(null);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/finalize`);
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to finalize');
    }
  }

  async function acknowledge(id: string) {
    setError(null);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/acknowledge`);
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to acknowledge');
    }
  }

  async function dispute(id: string) {
    const note = prompt('Enter dispute note');
    if (!note) return;
    setError(null);
    try {
      await axios.post(`/api/v1/transfer-requests/${id}/dispute`, { note });
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to dispute');
    }
  }

  const ackPending = useMemo(() => requests.filter((r) => r.status === 'ACK_PENDING'), [requests]);

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Transfer Requests</h2>
          <p>Create, view, finalize, and acknowledge scoped transfers.</p>
        </div>
      </header>

      {error ? <div className="error-panel">{error}</div> : null}

      <form className="form" onSubmit={handleLogin}>
        <h4>Login</h4>
        <label>
          Email
          <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
        </label>
        <button type="submit">Sign in</button>
      </form>

      <form className="form" onSubmit={submitRequest}>
        <h4>New Request</h4>
        <label>
          Direction
          <select value={direction} onChange={(e) => setDirection(e.target.value as TransferDirection)}>
            <option value="ISSUE">Checkout to technician (ISSUE)</option>
            <option value="RETURN">Return to warehouse (RETURN)</option>
          </select>
        </label>
        <label>
          Technician Id
          <input value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} required />
        </label>
        <label>
          Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div>
          <strong>Lines</strong>
          {lines.map((line, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                placeholder="Product ID"
                value={line.productId}
                onChange={(e) => updateLine(idx, { productId: e.target.value })}
                required
              />
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={line.quantity}
                onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                required
              />
              <input
                placeholder="Unit label"
                value={line.unitLabel}
                onChange={(e) => updateLine(idx, { unitLabel: e.target.value })}
                required
              />
            </div>
          ))}
          <button type="button" onClick={addLine}>
            + Add line
          </button>
        </div>
        <button type="submit" disabled={loading}>
          Submit request
        </button>
      </form>

      <div className="grid">
        <div>
          <h4>Open Queue</h4>
          <ul className="activity">
            {requests.map((req) => (
              <li key={req.id}>
                <div>
                  <strong>{req.direction}</strong> • {req.status} • Tech: {req.technicianId} • Lines: {req._count?.lines ?? 0}
                </div>
                <div className="pill-row">
                  <button type="button" onClick={() => finalize(req.id)}>
                    Finalize
                  </button>
                  {req.status === 'ACK_PENDING' ? (
                    <>
                      <button type="button" onClick={() => acknowledge(req.id)}>
                        Acknowledge
                      </button>
                      <button type="button" onClick={() => dispute(req.id)}>
                        Dispute
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Pending Acknowledgments</h4>
          <ul className="activity">
            {ackPending.map((req) => (
              <li key={req.id}>
                <div>
                  {req.direction} • {req.status} • Tech: {req.technicianId}
                </div>
                <button type="button" onClick={() => acknowledge(req.id)}>
                  Confirm receipt
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
