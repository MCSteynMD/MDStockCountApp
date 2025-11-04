import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  async function loadUsers() {
    try {
      setLoading(true);
      const { data } = await api.get('/api/users');
      setUsers(data.users ?? []);
      setError('');
    } catch (e) {
      setError('Failed to load users. Ensure you are logged in as admin.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  function openCreate() {
    setEditing({
      firstName: '', lastName: '', email: '', username: '', department: '', role: 'user', isActive: true, companies: [], password: ''
    });
    setShowModal(true);
  }
  function openEdit(u) { setEditing({ ...u, password: '' }); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditing(null); }

  async function saveUser(e) {
    e.preventDefault();
    const payload = {
      firstName: editing.firstName,
      lastName: editing.lastName,
      email: editing.email,
      username: editing.username,
      department: editing.department,
      role: editing.role,
      isActive: editing.isActive,
      companies: (editing.companies || []).map(c => c.trim()).filter(Boolean),
    };
    try {
      if (editing.id || editing._id) {
        const id = editing.id || editing._id;
        await api.put(`/api/users/${id}`, payload);
      } else {
        if (!editing.password) return alert('Password required for new user');
        await api.post('/api/users', { ...payload, password: editing.password });
      }
      closeModal();
      await loadUsers();
    } catch (e) {
      alert('Save failed');
    }
  }

  const table = useMemo(() => (
    <div className="overflow-auto border border-gray-200 dark:border-gray-800 rounded">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Username</th>
            <th className="p-2 text-left">Role</th>
            <th className="p-2 text-left">Companies</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u._id} className="border-t border-gray-200 dark:border-gray-800">
              <td className="p-2">{u.firstName} {u.lastName}</td>
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.username}</td>
              <td className="p-2">{u.role}</td>
              <td className="p-2">{(u.companies || []).join(', ')}</td>
              <td className="p-2">{u.isActive ? 'Active' : 'Inactive'}</td>
              <td className="p-2 text-right">
                <button onClick={() => openEdit(u)} className="px-2 py-1 border rounded border-gray-300 dark:border-gray-600">Edit</button>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr><td className="p-3 text-center text-gray-500 dark:text-gray-400" colSpan={7}>No users</td></tr>
          )}
        </tbody>
      </table>
    </div>
  ), [users]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">User Management</h2>
        <button onClick={openCreate} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm">Add user</button>
      </div>
      {loading ? <div>Loading...</div> : error ? <div className="text-red-600 dark:text-red-400 text-sm">{error}</div> : table}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4" onClick={closeModal}>
          <form className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded p-4 w-full max-w-xl space-y-3" onClick={e => e.stopPropagation()} onSubmit={saveUser}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="First name"><input value={editing.firstName} onChange={e=>setEditing({...editing, firstName:e.target.value})} className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700" required/></Field>
              <Field label="Last name"><input value={editing.lastName} onChange={e=>setEditing({...editing, lastName:e.target.value})} className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700" required/></Field>
              <Field label="Email"><input type="email" value={editing.email} onChange={e=>setEditing({...editing, email:e.target.value})} className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700" required/></Field>
              <Field label="Username"><input value={editing.username} onChange={e=>setEditing({...editing, username:e.target.value})} className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700" required/></Field>
              {!editing._id && !editing.id && (
                <Field label="Password"><input type="password" value={editing.password} onChange={e=>setEditing({...editing, password:e.target.value})} className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700" required/></Field>
              )}
              <Field label="Department"><input value={editing.department} onChange={e=>setEditing({...editing, department:e.target.value})} className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700"/></Field>
              <Field label="Role">
                <select value={editing.role} onChange={e=>setEditing({...editing, role:e.target.value})} className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={editing.isActive ? 'true' : 'false'} onChange={e=>setEditing({...editing, isActive:e.target.value==='true'})} className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700">
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </Field>
              <Field label="Companies (comma separated)" className="sm:col-span-2">
                <input value={(editing.companies || []).join(', ')} onChange={e=>setEditing({...editing, companies:e.target.value.split(',').map(s=>s.trim())})} className="w-full px-2 py-1 rounded border border-gray-300 dark:border-gray-700" placeholder="e.g. ZA10, ZA02"/>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={closeModal} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm">Cancel</button>
              <button type="submit" className="px-3 py-2 rounded bg-blue-600 text-white text-sm">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className='' }) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}



