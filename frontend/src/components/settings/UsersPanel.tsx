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

const truncateId = (value?: string | null) => {
  if (!value) return '';
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

export function UsersPanel() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('TECH');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(true);
  const [createTechnician, setCreateTechnician] = useState(true);
  const [technicians, setTechnicians] = useState<TechnicianRow[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string>('');
  const [editId, setEditId] = useState<string>('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('TECH');
  const [editActive, setEditActive] = useState(true);
  const [editCreateTechnician, setEditCreateTechnician] = useState(false);
  const [editTechnicianId, setEditTechnicianId] = useState<string>('');

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
      const response = await axios.get('/api/v1/technicians', { params: { limit: 200 } });
      setTechnicians(response.data ?? []);
    } catch {
      // optional list
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (open || editOpen) {
      loadTechnicians();
    }
  }, [open, editOpen]);

  function resetForm() {
    setName('');
    setEmail('');
    setRole('TECH');
    setPassword('');
    setActive(true);
    setCreateTechnician(true);
    setSelectedTechnicianId('');
  }

  function resetEditForm() {
    setEditId('');
    setEditName('');
    setEditEmail('');
    setEditRole('TECH');
    setEditActive(true);
    setEditCreateTechnician(false);
    setEditTechnicianId('');
  }

  function openEdit(user: UserRow) {
    setEditId(user.id);
    setEditName(user.name ?? '');
    setEditEmail(user.email ?? '');
    setEditRole(user.role ?? 'TECH');
    setEditActive(Boolean(user.active));
    setEditTechnicianId(user.technicianId ?? '');
    setEditCreateTechnician(user.role === 'TECH' && !user.technicianId);
    setEditOpen(true);
  }

  async function submit() {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Name, email, and password are required.');
      return;
    }
    if (role === 'TECH' && !createTechnician && !selectedTechnicianId) {
      const message = 'TECH users must be linked to a Technician record.';
      setError(message);
      showToast({ kind: 'error', message });
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
        payload.createTechnician = createTechnician && !selectedTechnicianId;
        if (selectedTechnicianId) {
          payload.technicianId = selectedTechnicianId;
        }
      } else if (selectedTechnicianId) {
        payload.technicianId = selectedTechnicianId;
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

  async function submitEdit() {
    if (!editName.trim() || !editEmail.trim()) {
      const message = 'Name and email are required.';
      setError(message);
      showToast({ kind: 'error', message });
      return;
    }
    if (editRole === 'TECH' && !editCreateTechnician && !editTechnicianId) {
      const message = 'TECH users must be linked to a Technician record.';
      setError(message);
      showToast({ kind: 'error', message });
      return;
    }
    setError(null);
    try {
      const payload: any = {
        name: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
        active: editActive,
      };
      if (editRole === 'TECH') {
        payload.createTechnician = editCreateTechnician && !editTechnicianId;
        payload.technicianId = editTechnicianId || null;
      } else {
        payload.technicianId = editTechnicianId || null;
      }
      await axios.patch(`/api/v1/admin/users/${editId}`, payload);
      showToast({ kind: 'success', message: 'User updated' });
      setEditOpen(false);
      resetEditForm();
      loadUsers();
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to update user.';
      setError(message);
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
                  <td>
                    {user.technicianId ? `Yes (${truncateId(user.technicianId)})` : 'No'}
                  </td>
                  <td>
                    <button type="button" className="ghost-button" onClick={() => openEdit(user)}>
                      Edit
                    </button>
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

      <ModalShell
        open={open}
        title="Add User"
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
      >
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
            <label>
              Create & link Technician record
              <input
                type="checkbox"
                checked={createTechnician}
                onChange={(e) => {
                  const next = e.target.checked;
                  setCreateTechnician(next);
                  if (next) {
                    setSelectedTechnicianId('');
                  }
                }}
              />
            </label>
          ) : null}
          <div className="muted">Users with a linked Technician can receive inventory (issued/checked out).</div>
          {createTechnician && role === 'TECH' ? null : (
            <label>
              Link existing Technician record
              <select
                value={selectedTechnicianId}
                required={role === 'TECH' && !createTechnician}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedTechnicianId(value);
                  if (value) {
                    setCreateTechnician(false);
                  }
                }}
              >
                <option value="">{role === 'TECH' ? 'Select technician' : 'None'}</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.active ? tech.name : `${tech.name} (inactive)`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {role === 'TECH' && !createTechnician && !selectedTechnicianId ? (
            <div className="error-panel">TECH users must be linked to a Technician record.</div>
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
      <ModalShell
        open={editOpen}
        title="Edit User"
        onClose={() => {
          setEditOpen(false);
          resetEditForm();
        }}
      >
        <div className="form">
          <label>
            Name
            <input value={editName} onChange={(e) => setEditName(e.target.value)} />
          </label>
          <label>
            Email
            <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
          </label>
          <label>
            Role
            <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
              <option value="ADMIN">ADMIN</option>
              <option value="MANAGER">MANAGER</option>
              <option value="WAREHOUSE">WAREHOUSE</option>
              <option value="TECH">TECH</option>
            </select>
          </label>
          <label>
            Active
            <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
          </label>
          {editRole === 'TECH' ? (
            <label>
              Create & link Technician record
              <input
                type="checkbox"
                checked={editCreateTechnician}
                onChange={(e) => {
                  const next = e.target.checked;
                  setEditCreateTechnician(next);
                  if (next) {
                    setEditTechnicianId('');
                  }
                }}
              />
            </label>
          ) : null}
          <div className="muted">Users with a linked Technician can receive inventory (issued/checked out).</div>
          {editCreateTechnician && editRole === 'TECH' ? null : (
            <label>
              Link existing Technician record
              <select
                value={editTechnicianId}
                required={editRole === 'TECH' && !editCreateTechnician}
                onChange={(e) => {
                  const value = e.target.value;
                  setEditTechnicianId(value);
                  if (value) {
                    setEditCreateTechnician(false);
                  }
                }}
              >
                <option value="">{editRole === 'TECH' ? 'Select technician' : 'None'}</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.active ? tech.name : `${tech.name} (inactive)`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {editRole === 'TECH' && !editCreateTechnician && !editTechnicianId ? (
            <div className="error-panel">TECH users must be linked to a Technician record.</div>
          ) : null}
          <div className="card-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setEditOpen(false);
                resetEditForm();
              }}
            >
              Cancel
            </button>
            <button type="button" onClick={submitEdit}>
              Save Changes
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
