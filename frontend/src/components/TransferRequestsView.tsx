import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type TransferDirection = 'ISSUE' | 'RETURN';
type TransferRequestStatus =
  | 'OPEN'
  | 'SUBMITTED'
  | 'FINALIZED'
  | 'ACK_PENDING'
  | 'ACKNOWLEDGED'
  | 'REJECTED'
  | 'CANCELED'
  | 'DISPUTED';

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
  technician?: { id: string; name: string };
};

type LoginResponse = {
  token: string;
  user: { id: string; email: string; role: string; technicianId?: string; name?: string };
};

type Technician = { id: string; name: string; active: boolean };
type Product = {
  id: string;
  name: string;
  baseType: string;
  trackingUnitLabel: string;
  checkoutUnitLabel: string;
};

const USER_STORAGE_KEY = 'authUser';

const loadToken = () => localStorage.getItem('authToken') || '';
const persistToken = (token: string) => localStorage.setItem('authToken', token);
const persistUser = (user: LoginResponse['user']) => localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
const loadStoredUser = () => {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginResponse['user'];
  } catch {
    return null;
  }
};
const applyToken = (token: string) => {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
};

const unitOptionsFor = (product?: Product) => {
  const options = [product?.checkoutUnitLabel, product?.trackingUnitLabel].filter(Boolean) as string[];
  return Array.from(new Set(options));
};

export function TransferRequestsView() {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [user, setUser] = useState<LoginResponse['user'] | null>(null);

  const [direction, setDirection] = useState<TransferDirection>('ISSUE');
  const [technicianId, setTechnicianId] = useState('');
  const [techSearch, setTechSearch] = useState('');
  const [reason, setReason] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [lines, setLines] = useState<TransferRequestLine[]>([{ productId: '', quantity: 1, unitLabel: '' }]);

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [openRequests, setOpenRequests] = useState<TransferRequest[]>([]);
  const [historyRequests, setHistoryRequests] = useState<TransferRequest[]>([]);
  const [recentDetail, setRecentDetail] = useState<TransferRequest | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    const token = loadToken();
    const storedUser = loadStoredUser();
    if (token) {
      applyToken(token);
      if (storedUser) setUser(storedUser);
      refreshReferenceData();
      refreshQueues();
    }
  }, []);

  const filteredTechnicians = useMemo(() => {
    const query = techSearch.trim().toLowerCase();
    if (!query) return technicians;
    return technicians.filter(
      (t) => t.name.toLowerCase().includes(query) || t.id.toLowerCase().includes(query),
    );
  }, [technicians, techSearch]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query) || p.baseType.toLowerCase().includes(query),
    );
  }, [products, productSearch]);

  const ackPending = useMemo(() => openRequests.filter((r) => r.status === 'ACK_PENDING'), [openRequests]);
  const ackPendingForUser = useMemo(() => {
    if (user?.role === 'TECH' && user.technicianId) {
      return ackPending.filter((r) => r.technicianId === user.technicianId);
    }
    return ackPending;
  }, [ackPending, user]);
  const closedHistory = useMemo(
    () => historyRequests.filter((r) => !['SUBMITTED', 'ACK_PENDING', 'DISPUTED', 'OPEN'].includes(r.status)),
    [historyRequests],
  );

  function handleError(context: string, err: any, fallback: string) {
    const message = err?.response?.data?.message || fallback;
    if (import.meta.env.DEV) {
      console.error(context, err?.response?.data ?? err);
    }
    setError(message);
    setToast({ kind: 'error', message });
  }

  async function fetchTechnicians() {
    try {
      const res = await axios.get<Technician[]>('/api/v1/technicians');
      setTechnicians(res.data);
    } catch (err: any) {
      handleError('load technicians failed', err, 'Failed to load technicians');
    }
  }

  async function fetchProducts() {
    try {
      const res = await axios.get<Product[]>('/api/v1/products', { params: { limit: 200 } });
      setProducts(res.data);
    } catch (err: any) {
      handleError('load products failed', err, 'Failed to load products');
    }
  }

  async function fetchOpenRequests() {
    try {
      const res = await axios.get<TransferRequest[]>('/api/v1/transfer-requests');
      setOpenRequests(res.data);
    } catch (err: any) {
      handleError('load open requests failed', err, 'Failed to load requests');
    }
  }

  async function fetchHistoryRequests() {
    try {
      const res = await axios.get<TransferRequest[]>('/api/v1/transfer-requests', {
        params: { includeClosed: true, limit: 100 },
      });
      setHistoryRequests(res.data);
    } catch (err: any) {
      handleError('load history failed', err, 'Failed to load history');
    }
  }

  function refreshReferenceData() {
    fetchTechnicians();
    fetchProducts();
  }

  function refreshQueues() {
    return Promise.all([fetchOpenRequests(), fetchHistoryRequests()]);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setToast(null);
    setLoading(true);
    try {
      const res = await axios.post<LoginResponse>('/api/v1/auth/login', { email: loginEmail, password: loginPassword });
      applyToken(res.data.token);
      persistToken(res.data.token);
      persistUser(res.data.user);
      setUser(res.data.user);
      refreshReferenceData();
      await refreshQueues();
      setToast({ kind: 'success', message: 'Signed in' });
    } catch (err: any) {
      handleError('login failed', err, 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function updateLine(index: number, patch: Partial<TransferRequestLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function onProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    const options = unitOptionsFor(product);
    const defaultUnit = options[0] ?? '';
    updateLine(index, {
      productId,
      unitLabel: options.includes(lines[index].unitLabel) ? lines[index].unitLabel : defaultUnit,
    });
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: '', quantity: 1, unitLabel: '' }]);
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setToast(null);
    setLoading(true);
    try {
      await axios.post('/api/v1/transfer-requests', {
        direction,
        technicianId,
        reason,
        lines,
      });
      await refreshQueues();
      setToast({ kind: 'success', message: 'Transfer request submitted' });
      setLines([{ productId: '', quantity: 1, unitLabel: '' }]);
    } catch (err: any) {
      handleError('create request failed', err, 'Failed to create request');
    } finally {
      setLoading(false);
    }
  }

  function availableActions(req: TransferRequest) {
    const isWarehouseRole = ['WAREHOUSE', 'MANAGER', 'ADMIN'].includes(user?.role ?? '');
    const isTechForRequest = user?.role === 'TECH' && user.technicianId === req.technicianId;
    return {
      canFinalize: req.status === 'SUBMITTED' && isWarehouseRole,
      canAcknowledge: req.status === 'ACK_PENDING' && isTechForRequest,
      canDispute: req.status === 'ACK_PENDING' && isTechForRequest,
    };
  }

  async function finalize(id: string) {
    setError(null);
    setToast(null);
    setActionBusy(true);
    try {
      const res = await axios.post<TransferRequest>(`/api/v1/transfer-requests/${id}/finalize`);
      setRecentDetail(res.data);
      await refreshQueues();
      setToast({ kind: 'success', message: 'Transfer finalized' });
    } catch (err: any) {
      handleError('finalize failed', err, 'Failed to finalize');
    } finally {
      setActionBusy(false);
    }
  }

  async function acknowledge(id: string) {
    setError(null);
    setToast(null);
    setActionBusy(true);
    try {
      const res = await axios.post<TransferRequest>(`/api/v1/transfer-requests/${id}/acknowledge`);
      setRecentDetail(res.data);
      await refreshQueues();
      setToast({ kind: 'success', message: 'Acknowledged receipt' });
    } catch (err: any) {
      handleError('acknowledge failed', err, 'Failed to acknowledge');
    } finally {
      setActionBusy(false);
    }
  }

  async function dispute(id: string) {
    const note = prompt('Enter dispute note');
    if (!note) return;
    setError(null);
    setToast(null);
    setActionBusy(true);
    try {
      const res = await axios.post<TransferRequest>(`/api/v1/transfer-requests/${id}/dispute`, { note });
      setRecentDetail(res.data);
      await refreshQueues();
      setToast({ kind: 'success', message: 'Dispute submitted' });
    } catch (err: any) {
      handleError('dispute failed', err, 'Failed to dispute');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <section>
      <header className="section-header">
        <div>
          <h2>Transfer Requests</h2>
          <p>Create, finalize, and acknowledge scoped transfers.</p>
        </div>
      </header>

      {toast ? (
        <div
          className={toast.kind === 'error' ? 'error-panel' : 'success-panel'}
          style={
            toast.kind === 'success'
              ? { marginBottom: '0.75rem', border: '1px solid #2e7d32', background: '#e8f5e9', color: '#1b5e20' }
              : { marginBottom: '0.75rem' }
          }
        >
          {toast.message}
        </div>
      ) : null}
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
        <button type="submit" disabled={loading}>
          Sign in
        </button>
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
          Find technician
          <input
            placeholder="Search name or id"
            value={techSearch}
            onChange={(e) => setTechSearch(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Technician
          <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} required>
            <option value="">Select technician</option>
            {filteredTechnicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name} ({tech.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div>
          <strong>Lines</strong>
          <label>
            Find product
            <input
              placeholder="Search name, id, or unit"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              autoComplete="off"
            />
          </label>
          {lines.map((line, idx) => {
            const product = products.find((p) => p.id === line.productId);
            const options = unitOptionsFor(product);
            const unitLabel = options.includes(line.unitLabel) ? line.unitLabel : '';
            return (
              <div
                key={idx}
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem', marginTop: '0.25rem' }}
              >
                <label>
                  Product
                  <select
                    value={line.productId}
                    onChange={(e) => onProductChange(idx, e.target.value)}
                    required
                  >
                    <option value="">Select product</option>
                    {filteredProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.baseType})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 0 })}
                    required
                  />
                </label>
                <label>
                  Unit
                  <select
                    value={unitLabel}
                    onChange={(e) => updateLine(idx, { unitLabel: e.target.value })}
                    disabled={!product}
                    required
                  >
                    <option value="" disabled>
                      Select unit
                    </option>
                    {options.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
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
            {openRequests.map((req) => {
              const actions = availableActions(req);
              return (
                <li key={req.id}>
                  <div>
                    <strong>{req.direction}</strong> -> {req.status} -> Tech: {req.technician?.name ?? req.technicianId} -> Lines:{' '}
                    {req._count?.lines ?? 0}
                  </div>
                  <div className="pill-row">
                    {actions.canFinalize ? (
                      <button type="button" onClick={() => finalize(req.id)} disabled={actionBusy}>
                        Finalize
                      </button>
                    ) : null}
                    {actions.canAcknowledge ? (
                      <button type="button" onClick={() => acknowledge(req.id)} disabled={actionBusy}>
                        Acknowledge
                      </button>
                    ) : null}
                    {actions.canDispute ? (
                      <button type="button" onClick={() => dispute(req.id)} disabled={actionBusy}>
                        Dispute
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h4>Pending Acknowledgments</h4>
          <ul className="activity">
            {ackPendingForUser.map((req) => {
              const actions = availableActions(req);
              return (
                <li key={req.id}>
                  <div>
                    {req.direction} -> {req.status} -> Tech: {req.technician?.name ?? req.technicianId}
                  </div>
                  <div className="pill-row">
                    {actions.canAcknowledge ? (
                      <button type="button" onClick={() => acknowledge(req.id)} disabled={actionBusy}>
                        Confirm receipt
                      </button>
                    ) : null}
                    {actions.canDispute ? (
                      <button type="button" onClick={() => dispute(req.id)} disabled={actionBusy}>
                        Dispute
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {ackPendingForUser.length === 0 ? <li>No pending acknowledgments</li> : null}
          </ul>
        </div>
      </div>

      <div>
        <h4>History</h4>
        <ul className="activity">
          {closedHistory.map((req) => (
            <li key={req.id}>
              <div>
                <strong>{req.direction}</strong> -> {req.status} -> Tech: {req.technician?.name ?? req.technicianId}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#555' }}>
                Created {new Date(req.createdAt).toLocaleString()}
                {req.finalizedAt ? ` | Finalized ${new Date(req.finalizedAt).toLocaleString()}` : ''}
                {req.acknowledgedAt ? ` | Acknowledged ${new Date(req.acknowledgedAt).toLocaleString()}` : ''}
              </div>
            </li>
          ))}
          {closedHistory.length === 0 ? <li>No history yet</li> : null}
        </ul>
      </div>

      {recentDetail ? (
        <div className="info-panel" style={{ marginTop: '1rem' }}>
          Last updated request: {recentDetail.id} is now {recentDetail.status}
        </div>
      ) : null}
    </section>
  );
}
