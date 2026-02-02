import { useEffect, useState } from 'react';
import axios from 'axios';
import { useToast } from '../ui/Toast';
import { ModalShell } from '../ui/ModalShell';

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  technicianId?: string | null;
  technician?: { id: string; name: string } | null;
};

type TechnicianRow = {
  id: string;
  name: string;
  active: boolean;
};

export function UsersPanel() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('TECH');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(true);
  const [createTechnician, setCreateTechnician] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianRow[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('');

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/v1/admin/users');
      setUsers(response.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  async function loadTechnicians() {
    try {
      const response = await axios.get('/api/v1/technicians', { params: { active: true, limit: 200 } });
      setTechnicians(response.data ?? []);
    } catch {
      // optional list
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (role === 'TECH' && !createTechnician) {
      loadTechnicians();
    }
  }, [role, createTechnician]);

  function resetForm() {
    setName('');
    setEmail('');
    setRole('TECH');
    setPassword('');
    setActive(true);
    setCreateTechnician(true);
    setSelectedTechnicianId('');
  }

  async function submit() {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Name, email, and password are required.');
      return;
    }
    setError(null);
    try {
      const payload: any = {
        name: name.trim(),
        email: email.trim(),
        role,
        password,
        active,
      };
      if (role === 'TECH') {
        payload.createTechnician = createTechnician;
        if (!createTechnician && selectedTechnicianId) {
          payload.technicianId = selectedTechnicianId;
        }
      }
      await axios.post('/api/v1/admin/users', payload);
      showToast({ kind: 'success', message: 'User created' });
      setOpen(false);
      resetForm();
      loadUsers();
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to create user.';
      setError(message);
      showToast({ kind: 'error', message });
    }
  }

  async function toggleActive(user: UserRow) {
    try {
      await axios.patch(`/api/v1/admin/users/${user.id}`, { active: !user.active });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, active: !u.active } : u)));
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to update user.';
      showToast({ kind: 'error', message });
    }
  }

  return (
    <div className="card card-stack">
      <div className="card-row">
        <div>
          <div className="card-title">Users</div>
          <div className="muted">Admin-only user management.</div>
        </div>
        <button type="button" onClick={() => setOpen(true)}>
          Add User
        </button>
      </div>
      {error ? <div className="error-panel">{error}</div> : null}
      {loading ? (
        <div className="muted">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="muted">No users yet.</div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Active</th>
                <th>Technician Linked</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.active ? 'Yes' : 'No'}</td>
                  <td>{user.technicianId ? 'Yes' : 'No'}</td>
                  <td>
                    <button type="button" className="ghost-button" onClick={() => toggleActive(user)}>
                      {user.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalShell open={open} title="Add User" onClose={() => setOpen(false)}>
        <div className="form">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="ADMIN">ADMIN</option>
              <option value="MANAGER">MANAGER</option>
              <option value="WAREHOUSE">WAREHOUSE</option>
              <option value="TECH">TECH</option>
            </select>
          </label>
          <label>
            Temp Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Active
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          </label>
          {role === 'TECH' ? (
            <>
              <label>
                Create Technician record
                <input
                  type="checkbox"
                  checked={createTechnician}
                  onChange={(e) => setCreateTechnician(e.target.checked)}
                />
              </label>
              {!createTechnician ? (
                <label>
                  Link existing Technician (optional)
                  <select
                    value={selectedTechnicianId}
                    onChange={(e) => setSelectedTechnicianId(e.target.value)}
                  >
                    <option value="">None</option>
                    {technicians.map((tech) => (
                      <option key={tech.id} value={tech.id}>
                        {tech.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
          <div className="card-row">
            <button type="button" className="ghost-button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" onClick={submit}>
              Create User
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
