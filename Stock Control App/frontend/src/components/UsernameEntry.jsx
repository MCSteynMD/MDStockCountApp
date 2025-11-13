import { useState } from 'react';

export default function UsernameEntry({ onUsernameSet }) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      sessionStorage.setItem('username', username.trim());
      onUsernameSet(username.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-[0_8px_16px_rgba(0,0,0,0.2)] p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">Enter Your Name</h2>
        <p className="text-sm text-gray-600 mb-6">Please enter your name to continue</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3 border border-[#C8C6C4] rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] text-gray-800 mb-4"
            autoFocus
            required
          />
          <button
            type="submit"
            className="w-full px-4 py-3 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] font-medium transition-all shadow-[0_2px_4px_rgba(0,120,212,0.3)] hover:shadow-[0_4px_8px_rgba(0,120,212,0.4)] active:scale-[0.97]"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}

