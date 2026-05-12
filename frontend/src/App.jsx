import { useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_ORIGIN || 'https://approval-workflow.onrender.com';

const emptyForm = {
  document_name: '',
  document_description: '',
  request_message: '',
  document: null,
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [health, setHealth] = useState('checking');
  const [me, setMe] = useState({ authenticated: false, username: '', role: 'USER' });
  const [requests, setRequests] = useState([]);
  const [mine, setMine] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminLogs, setAdminLogs] = useState([]);
  const [adminBusy, setAdminBusy] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'USER' });
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');

  const jsonHeaders = useMemo(() => {
    const value = { 'Content-Type': 'application/json' };
    if (token) value.Authorization = `Bearer ${token}`;
    return value;
  }, [token]);

  async function loadDashboard(authToken = token) {
    const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    const [healthRes, meRes, allRes, mineRes] = await Promise.all([
      fetch(`${API_BASE}/health`),
      fetch(`${API_BASE}/me/`, { headers: authHeaders }),
      fetch(`${API_BASE}/requests/`, { headers: authHeaders }),
      fetch(`${API_BASE}/requests/my/`, { headers: authHeaders }),
    ]);

    setHealth(await healthRes.text());

    if (meRes.ok) {
      const meData = await meRes.json();
      setMe(meData);
      setAuthReady(true);
      setAuthError('');
      if (meData.is_admin || meData.role === 'ADMIN') {
        await loadAdminData(authToken);
      }
    } else {
      setMe({ authenticated: false, username: '', role: 'USER' });
      setAuthReady(true);
      if (authToken) {
        clearSession();
      }
    }

    if (allRes.ok) setRequests(await allRes.json());
    if (mineRes.ok) setMine(await mineRes.json());
  }

  async function loadAdminData(authToken = token) {
    const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    setAdminBusy(true);
    try {
      const [usersRes, logsRes] = await Promise.all([
        fetch(`${API_BASE}/admin/users/`, { headers: authHeaders }),
        fetch(`${API_BASE}/admin/logs/`, { headers: authHeaders }),
      ]);
      if (usersRes.ok) {
        const users = await usersRes.json();
        setAdminUsers(users.map((user) => ({ ...user, admin_password: '' })));
      }
      if (logsRes.ok) setAdminLogs(await logsRes.json());
    } finally {
      setAdminBusy(false);
    }
  }

  function clearSession() {
    localStorage.removeItem('token');
    setToken('');
    setRequests([]);
    setMine([]);
    setForm(emptyForm);
  }

  useEffect(() => {
    loadDashboard().catch(() => {
      setHealth('offline');
      setAuthReady(true);
    });
  }, []);

  async function login(event) {
    event.preventDefault();
    setMessage('');
    setAuthError('');
    const response = await fetch(`${API_BASE}/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      setAuthError('Sign in failed. Check your username and password.');
      return;
    }
    const data = await response.json();
    localStorage.setItem('token', data.access);
    setToken(data.access);
    setMessage('Signed in successfully.');
    await loadDashboard(data.access);
  }

  async function logout() {
    clearSession();
    setMe({ authenticated: false, username: '', role: 'USER' });
    setMessage('Signed out.');
    setAuthReady(true);
  }

  async function updateAdminUser(user) {
    const payload = {
      user_id: user.id,
      username: user.username,
      email: user.email,
      is_active: user.is_active,
    };
    if (!(user.is_superuser || user.is_staff)) {
      payload.role = user.role;
    }
    if (user.admin_password && user.admin_password.trim()) {
      payload.password = user.admin_password;
    }

    const response = await fetch(`${API_BASE}/admin/users/`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'User update failed' }));
      setMessage(error.detail || 'User update failed');
      return;
    }
    setMessage('User updated');
    await loadAdminData();
  }

  function onAdminField(userId, field, value) {
    setAdminUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, [field]: value } : user)));
  }

  function documentUrl(path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${BACKEND_ORIGIN}${path}`;
  }

  async function createAdminUser(event) {
    event.preventDefault();
    const response = await fetch(`${API_BASE}/admin/users/`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(newUser),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'User creation failed' }));
      setMessage(error.detail || 'User creation failed');
      return;
    }
    setMessage('User created');
    setNewUser({ username: '', email: '', password: '', role: 'USER' });
    await loadAdminData();
  }

  async function createRequest(event) {
    event.preventDefault();
    const payload = new FormData();
    payload.append('document_name', form.document_name);
    payload.append('document_description', form.document_description);
    payload.append('request_message', form.request_message);
    if (form.document) payload.append('document', form.document);
    const response = await fetch(`${API_BASE}/requests/`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: payload,
    });
    if (!response.ok) {
      setMessage('Create request failed');
      return;
    }
    setForm(emptyForm);
    setMessage('Request created');
    await loadDashboard();
  }

  async function act(id, action, reason = '') {
    const response = await fetch(`${API_BASE}/requests/${id}/${action}/`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(reason ? { reason } : {}),
    });
    if (!response.ok) {
      setMessage('Action rejected by server');
      return;
    }
    setMessage(`Request ${action}d`);
    await loadDashboard();
  }

  function canHandle(item) {
    if (!me.authenticated) return false;
    if (me.role === 'ADMIN') return true;
    if (item.status === 'PENDING_LOWER') return me.role === 'LOWER';
    if (item.status === 'PENDING_MIDDLE') return me.role === 'MIDDLE';
    if (item.status === 'PENDING_HIGHER') return me.role === 'HIGHER';
    return false;
  }

  if (!authReady) {
    return <div className="page-frame"><div className="loading-card">Loading workspace...</div></div>;
  }

  if (!me.authenticated) {
    return (
      <div className="page-frame auth-page">
        <section className="auth-panel">
          <div className="auth-hero">
            <div className="brand-mark">AO</div>
            <p className="eyebrow">Approval Operations</p>
            <h1>Secure document approval workflow.</h1>
            <p className="subtle">
              Sign in to manage requests, review approvals, and track every stage from one corporate dashboard.
            </p>
          </div>

          <form className="auth-form" onSubmit={login}>
            <h2>Sign in</h2>
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
            <button type="submit">Sign in</button>
            {authError ? <p className="error-text">{authError}</p> : null}
          </form>
        </section>
      </div>
    );
  }

  if (me.role === 'ADMIN') {
    return (
      <div className="page-frame">
        <header className="topbar card">
          <div>
            <p className="eyebrow">Administration</p>
            <h1>Admin Panel</h1>
            <p className="subtle">Manage users, assign roles, and review activity logs.</p>
          </div>
          <div className="topbar-meta">
            <span className="status-pill">API: {health}</span>
            <span className="status-pill">{me.username} · ADMIN</span>
            <button className="ghost" onClick={logout}>Sign out</button>
          </div>
        </header>

        <section className="stats-grid">
          <div className="stat-card"><span>Users</span><strong>{adminUsers.length}</strong></div>
          <div className="stat-card"><span>Logs</span><strong>{adminLogs.length}</strong></div>
          <div className="stat-card"><span>Status</span><strong>{adminBusy ? 'Refreshing' : 'Live'}</strong></div>
        </section>

        <section className="grid">
          <div className="card panel">
            <div className="panel-title">
              <h2>Manage Users</h2>
              <p className="subtle">Assign approval roles to active users.</p>
            </div>

            <form className="create-user" onSubmit={createAdminUser}>
              <h3>Create User</h3>
              <div className="create-user-grid">
                <input
                  placeholder="username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                />
                <input
                  placeholder="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
                <input
                  type="password"
                  placeholder="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="USER">USER</option>
                  <option value="LOWER">LOWER</option>
                  <option value="MIDDLE">MIDDLE</option>
                  <option value="HIGHER">HIGHER</option>
                </select>
              </div>
              <button type="submit">Create user</button>
            </form>

            <div className="table-list">
              {adminUsers.map((user) => (
                <article className="row-item admin-row" key={user.id}>
                  <div>
                    <input
                      className="inline-input"
                      value={user.username}
                      onChange={(e) => onAdminField(user.id, 'username', e.target.value)}
                    />
                    <input
                      className="inline-input"
                      value={user.email || ''}
                      placeholder="email"
                      onChange={(e) => onAdminField(user.id, 'email', e.target.value)}
                    />
                    <label className="inline-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(user.is_active)}
                        onChange={(e) => onAdminField(user.id, 'is_active', e.target.checked)}
                      />
                      Active
                    </label>
                    <input
                      type="password"
                      className="inline-input"
                      placeholder="new password (optional)"
                      value={user.admin_password || ''}
                      onChange={(e) => onAdminField(user.id, 'admin_password', e.target.value)}
                    />
                    <small>{user.is_superuser ? 'Superuser' : user.is_staff ? 'Staff' : 'Standard user'}</small>
                  </div>
                  <div className="admin-controls">
                    <span className="stage-tag">{user.role}</span>
                    {user.is_superuser || user.is_staff ? (
                      <span className="muted-chip">System admin</span>
                    ) : (
                      <select value={user.role} onChange={(e) => onAdminField(user.id, 'role', e.target.value)}>
                        <option value="USER">USER</option>
                        <option value="LOWER">LOWER</option>
                        <option value="MIDDLE">MIDDLE</option>
                        <option value="HIGHER">HIGHER</option>
                      </select>
                    )}
                    <button onClick={() => updateAdminUser(user)}>Save user</button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="card panel">
            <div className="panel-title">
              <h2>View Logs</h2>
              <p className="subtle">Recent approval activity.</p>
            </div>
            <div className="table-list">
              {adminLogs.map((log) => (
                <article className="row-item log-row" key={log.id}>
                  <div>
                    <strong>{log.request_id}</strong>
                    <p>{log.document_name}</p>
                    <small>{log.acted_by} · {log.created_at}</small>
                  </div>
                  <div className="admin-controls">
                    <span className="stage-tag">{log.action}</span>
                    <small>{log.comments || 'No comments'}</small>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {message ? <p className="toast">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="page-frame">
      <header className="topbar card">
        <div>
          <p className="eyebrow">Approval Operations</p>
          <h1>Document Approval Control Center</h1>
          <p className="subtle">Corporate approval workflow with role-based routing and JWT security.</p>
        </div>
        <div className="topbar-meta">
          <span className="status-pill">API: {health}</span>
          <span className="status-pill">{me.username} · {me.role}</span>
          <button className="ghost" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <span>My requests</span>
          <strong>{mine.length}</strong>
        </div>
        <div className="stat-card">
          <span>Approval queue</span>
          <strong>{requests.length}</strong>
        </div>
        <div className="stat-card">
          <span>Current role</span>
          <strong>{me.role}</strong>
        </div>
      </section>

      <section className="grid">
        <form className="card panel" onSubmit={createRequest}>
          <div className="panel-title">
            <h2>New request</h2>
            <p className="subtle">Submit a document for the approval chain.</p>
          </div>
          <label>
            Document name
            <input required value={form.document_name} onChange={(e) => setForm({ ...form, document_name: e.target.value })} />
          </label>
          <label>
            Description
            <textarea required value={form.document_description} onChange={(e) => setForm({ ...form, document_description: e.target.value })} />
          </label>
          <label>
            Request message
            <textarea required value={form.request_message} onChange={(e) => setForm({ ...form, request_message: e.target.value })} />
          </label>
          <label>
            File attachment
            <input required type="file" onChange={(e) => setForm({ ...form, document: e.target.files?.[0] || null })} />
          </label>
          <button type="submit">Submit request</button>
        </form>

        <div className="card panel">
          <div className="panel-title">
            <h2>My requests</h2>
            <p className="subtle">Track the documents you submitted.</p>
          </div>
          <div className="table-list">
            {mine.length ? mine.map((item) => (
              <article className="row-item" key={item.id}>
                <div>
                  <strong>{item.request_id}</strong>
                  <p>{item.document_name}</p>
                </div>
                <div className="doc-row">
                  {item.document ? (
                    <a className="doc-link" href={documentUrl(item.document)} target="_blank" rel="noreferrer">View document</a>
                  ) : (
                    <small>No document uploaded</small>
                  )}
                </div>
                <span className="stage-tag">{item.status}</span>
              </article>
            )) : <p className="empty-state">No requests yet.</p>}
          </div>
        </div>
      </section>

      <section className="card panel queue-panel">
        <div className="panel-title">
          <h2>Approval queue</h2>
          <p className="subtle">Only the matching role can process a request stage.</p>
        </div>
        <div className="table-list">
          {requests.length ? requests.map((item) => (
            <article className="row-item queue-row" key={item.id}>
              <div>
                <strong>{item.request_id}</strong>
                <p>{item.document_name}</p>
                <small>{item.document_description}</small>
              </div>
              <div className="doc-row">
                {item.document ? (
                  <a className="doc-link" href={documentUrl(item.document)} target="_blank" rel="noreferrer">View document</a>
                ) : (
                  <small>No document uploaded</small>
                )}
              </div>
              <div className="queue-actions">
                <span className="stage-tag">{item.status}</span>
                {canHandle(item) ? (
                  <div className="actions">
                    <button onClick={() => act(item.id, 'approve')}>Approve</button>
                    <button className="danger" onClick={() => act(item.id, 'reject', 'Rejected from dashboard')}>
                      Reject
                    </button>
                  </div>
                ) : (
                  <small className="subtle">Not your stage</small>
                )}
              </div>
            </article>
          )) : <p className="empty-state">No items in the approval queue.</p>}
        </div>
      </section>

      {message ? <p className="toast">{message}</p> : null}
    </div>
  );
}

export default App;
