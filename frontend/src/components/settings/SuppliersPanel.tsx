import { useEffect, useState } from 'react';
import axios from 'axios';
import { useToast } from '../ui/Toast';
import { ModalShell } from '../ui/ModalShell';

type SupplierRow = {
  id: string;
  name: string;
  email?: string | null;
  licenseNumber?: string | null;
  ein?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
};

type SupplierForm = {
  name: string;
  email: string;
  licenseNumber: string;
  ein: string;
  phone: string;
  address: string;
  notes: string;
};

const EMPTY_FORM: SupplierForm = {
  name: '',
  email: '',
  licenseNumber: '',
  ein: '',
  phone: '',
  address: '',
  notes: '',
};

export function SuppliersPanel() {
  const { showToast } = useToast();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/v1/suppliers');
      setSuppliers(response.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }

  function openEdit(supplier: SupplierRow) {
    setEditId(supplier.id);
    setForm({
      name: supplier.name ?? '',
      email: supplier.email ?? '',
      licenseNumber: supplier.licenseNumber ?? '',
      ein: supplier.ein ?? '',
      phone: supplier.phone ?? '',
      address: supplier.address ?? '',
      notes: supplier.notes ?? '',
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      showToast({ kind: 'error', message: 'Supplier name is required.' });
      return;
    }
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        licenseNumber: form.licenseNumber.trim() || undefined,
        ein: form.ein.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editId) {
        await axios.patch(`/api/v1/suppliers/${editId}`, payload);
        showToast({ kind: 'success', message: 'Supplier updated' });
      } else {
        await axios.post('/api/v1/suppliers', payload);
        showToast({ kind: 'success', message: 'Supplier created' });
      }
      setOpen(false);
      setEditId(null);
      setForm(EMPTY_FORM);
      load();
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to save supplier.';
      showToast({ kind: 'error', message });
    }
  }

  async function remove(id: string) {
    try {
      await axios.delete(`/api/v1/suppliers/${id}`);
      showToast({ kind: 'success', message: 'Supplier deleted' });
      load();
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to delete supplier.';
      showToast({ kind: 'error', message });
    }
  }

  return (
    <div className="card card-stack">
      <div className="card-row">
        <div>
          <div className="card-title">Supplier Settings</div>
          <div className="muted">Manage purchasing vendors used by Ordering.</div>
        </div>
        <button type="button" onClick={openCreate}>
          Add Supplier
        </button>
      </div>
      {error ? <div className="error-panel">{error}</div> : null}
      {loading ? (
        <div className="muted">Loading suppliers...</div>
      ) : suppliers.length === 0 ? (
        <div className="muted">No suppliers yet.</div>
      ) : (
        <ul className="activity">
          {suppliers.map((supplier) => (
            <li key={supplier.id}>
              <div className="card-stack">
                <strong>{supplier.name}</strong>
                {supplier.email ? <div className="muted">{supplier.email}</div> : null}
                {supplier.phone ? <div className="muted">Phone: {supplier.phone}</div> : null}
                <div className="pill-row">
                  <button type="button" className="ghost-button" onClick={() => openEdit(supplier)}>
                    Edit
                  </button>
                  <button type="button" className="ghost-button" onClick={() => remove(supplier.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ModalShell
        open={open}
        title={editId ? 'Edit Supplier' : 'Add Supplier'}
        onClose={() => {
          setOpen(false);
          setEditId(null);
          setForm(EMPTY_FORM);
        }}
      >
        <div className="form">
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Required if EMAIL order type is used"
            />
          </label>
          <label>
            License Number
            <input
              value={form.licenseNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, licenseNumber: e.target.value }))}
            />
          </label>
          <label>
            EIN
            <input value={form.ein} onChange={(e) => setForm((prev) => ({ ...prev, ein: e.target.value }))} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
          </label>
          <label>
            Address
            <textarea rows={2} value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} />
          </label>
          <label>
            Notes
            <textarea rows={3} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </label>
          <div className="card-row">
            <button type="button" className="ghost-button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" onClick={save}>
              Save
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
