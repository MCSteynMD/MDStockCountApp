import { useState, useEffect } from 'react';

// Password hash (SHA-256 of 'admin123' for demo - change this!)
// In production, use a proper hash stored in environment variable or backend
const ADMIN_PASSWORD_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'; // 'admin123'

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function PasswordProtect({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Check session storage for existing auth
  useEffect(() => {
    const authTime = sessionStorage.getItem('reconcile_auth_time');
    if (authTime) {
      const timeDiff = Date.now() - parseInt(authTime, 10);
      // Auth expires after 4 hours
      if (timeDiff < 4 * 60 * 60 * 1000) {
        setIsAuthenticated(true);
      } else {
        sessionStorage.removeItem('reconcile_auth_time');
      }
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    
    try {
      const hash = await hashPassword(password);
      if (hash === ADMIN_PASSWORD_HASH) {
        setIsAuthenticated(true);
        sessionStorage.setItem('reconcile_auth_time', Date.now().toString());
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    } catch (err) {
      setError('Authentication error');
      console.error(err);
    }
  }

  if (isAuthenticated) {
    return children;
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-white rounded-sm border border-[#EDEBE9] shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Password Required</h2>
        <p className="text-sm text-gray-600 mb-6">
          This page is restricted. Please enter the password to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4]"
              autoFocus
            />
          </div>
          {error && (
            <div className="text-sm text-[#D13438] bg-[#FDF6F6] px-3 py-2 rounded-sm">{error}</div>
          )}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] font-medium transition-colors active:scale-[0.97]"
          >
            Authenticate
          </button>
        </form>
      </div>
    </div>
  );
}

