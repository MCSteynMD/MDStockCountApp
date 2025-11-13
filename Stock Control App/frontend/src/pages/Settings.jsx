import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { loadHistoricalCounts, downloadHistoricalCountsCSV } from '../lib/countHistory';
import { getFutureCounts, saveFutureCount, deleteFutureCount } from '../lib/futureCounts';

export default function Settings() {
  const [accentColor, setAccentColor] = useState('#0078D4');
  const [darkMode, setDarkMode] = useState(false);
  const [historicalCounts, setHistoricalCounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [futureCounts, setFutureCounts] = useState([]);
  const [showFutureCountForm, setShowFutureCountForm] = useState(false);
  const [editingCount, setEditingCount] = useState(null);
  const [futureCountForm, setFutureCountForm] = useState({
    date: '',
    company: '',
    warehouse: '',
    notes: ''
  });

  // Load settings from localStorage
  useEffect(() => {
    const savedColor = localStorage.getItem('accentColor') || '#0078D4';
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setAccentColor(savedColor);
    setDarkMode(savedDarkMode);
    applySettings(savedColor, savedDarkMode);
  }, []);

  // Load historical counts
  useEffect(() => {
    loadHistoricalCountsData();
  }, []);

  // Load future counts
  useEffect(() => {
    loadFutureCounts();
  }, []);

  const applySettings = (color, isDark) => {
    // Apply accent color
    document.documentElement.style.setProperty('--d365-blue', color);
    const rgb = hexToRgb(color);
    if (rgb) {
      const hoverColor = adjustBrightness(color, -10);
      const activeColor = adjustBrightness(color, -20);
      document.documentElement.style.setProperty('--d365-blue-hover', hoverColor);
      document.documentElement.style.setProperty('--d365-blue-active', activeColor);
    }

    // Apply dark mode
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  const adjustBrightness = (hex, percent) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const r = Math.max(0, Math.min(255, rgb.r + percent));
    const g = Math.max(0, Math.min(255, rgb.g + percent));
    const b = Math.max(0, Math.min(255, rgb.b + percent));
    return `#${[r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('')}`;
  };

  const handleColorChange = (color) => {
    setAccentColor(color);
    localStorage.setItem('accentColor', color);
    applySettings(color, darkMode);
  };

  const handleDarkModeToggle = (enabled) => {
    setDarkMode(enabled);
    localStorage.setItem('darkMode', enabled.toString());
    applySettings(accentColor, enabled);
  };

  const loadHistoricalCountsData = async () => {
    setLoading(true);
    try {
      const counts = await loadHistoricalCounts();
      setHistoricalCounts(counts);
    } catch (error) {
      console.error('Error loading historical counts:', error);
      setHistoricalCounts([]);
    } finally {
      setLoading(false);
    }
  };

  const loadFutureCounts = () => {
    const counts = getFutureCounts();
    setFutureCounts(counts);
  };

  const handleFutureCountSubmit = (e) => {
    e.preventDefault();
    if (!futureCountForm.date) {
      alert('Please select a date');
      return;
    }

    try {
      if (editingCount) {
        saveFutureCount({ ...futureCountForm, id: editingCount.id });
      } else {
        saveFutureCount(futureCountForm);
      }
      loadFutureCounts();
      setShowFutureCountForm(false);
      setEditingCount(null);
      setFutureCountForm({ date: '', company: '', warehouse: '', notes: '' });
      // Dispatch event to update calendar
      window.dispatchEvent(new Event('futureCountsUpdated'));
    } catch (error) {
      console.error('Error saving future count:', error);
      alert('Error saving future count');
    }
  };

  const handleEditFutureCount = (count) => {
    setEditingCount(count);
    setFutureCountForm({
      date: count.date,
      company: count.company || '',
      warehouse: count.warehouse || '',
      notes: count.notes || ''
    });
    setShowFutureCountForm(true);
  };

  const handleDeleteFutureCount = (id) => {
    if (window.confirm('Are you sure you want to delete this scheduled count?')) {
      deleteFutureCount(id);
      loadFutureCounts();
      window.dispatchEvent(new Event('futureCountsUpdated'));
    }
  };

  const handleCancelFutureCountForm = () => {
    setShowFutureCountForm(false);
    setEditingCount(null);
    setFutureCountForm({ date: '', company: '', warehouse: '', notes: '' });
  };

  const presetColors = [
    { name: 'Blue', value: '#0078D4' },
    { name: 'Green', value: '#107C10' },
    { name: 'Purple', value: '#8764B8' },
    { name: 'Orange', value: '#FF8C00' },
    { name: 'Teal', value: '#00B7C3' },
    { name: 'Red', value: '#D13438' },
  ];

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-1">Settings</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">Customize your app appearance and preferences</p>
      </div>

      {/* Accent Color */}
      <div className="bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] p-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Accent Color</h3>
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            {presetColors.map((color) => (
              <button
                key={color.value}
                onClick={() => handleColorChange(color.value)}
                className={`w-12 h-12 rounded-sm border-2 transition-all active:scale-95 ${
                  accentColor === color.value
                    ? 'border-gray-800 dark:border-gray-300 scale-110 shadow-lg ring-2 ring-offset-2 ring-gray-400'
                    : 'border-gray-300 dark:border-gray-600 hover:border-gray-500 dark:hover:border-gray-400 hover:scale-105'
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Custom Color:</label>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-16 h-10 rounded border border-[#C8C6C4] dark:border-[#505050] cursor-pointer"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">{accentColor}</span>
          </div>
        </div>
      </div>

      {/* Dark Mode */}
      <div className="bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">Dark Mode</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Toggle dark mode theme</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={darkMode}
              onChange={(e) => handleDarkModeToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0078D4]"></div>
          </label>
        </div>
      </div>

      {/* Future Counts */}
      <div className="bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Scheduled Future Counts</h3>
          <button
            onClick={() => setShowFutureCountForm(true)}
            className="px-3 py-1.5 text-sm bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,120,212,0.3)] hover:shadow-[0_4px_8px_rgba(0,120,212,0.4)]"
          >
            + Add Scheduled Count
          </button>
        </div>

        {showFutureCountForm && (
          <form onSubmit={handleFutureCountSubmit} className="mb-4 p-4 border border-[#EDEBE9] dark:border-[#404040] rounded-sm bg-[#F3F2F1] dark:bg-[#353535]">
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
              {editingCount ? 'Edit Scheduled Count' : 'New Scheduled Count'}
            </h4>
            <div className="grid gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={futureCountForm.date}
                  onChange={(e) => setFutureCountForm({ ...futureCountForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4]"
                  required
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label>
                <input
                  type="text"
                  value={futureCountForm.company}
                  onChange={(e) => setFutureCountForm({ ...futureCountForm, company: e.target.value })}
                  className="w-full px-3 py-2 border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4]"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Warehouse</label>
                <input
                  type="text"
                  value={futureCountForm.warehouse}
                  onChange={(e) => setFutureCountForm({ ...futureCountForm, warehouse: e.target.value })}
                  className="w-full px-3 py-2 border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4]"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={futureCountForm.notes}
                  onChange={(e) => setFutureCountForm({ ...futureCountForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#2d2d2d] text-gray-800 dark:text-gray-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4]"
                  placeholder="Optional notes about this scheduled count"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] active:scale-95 transition-all shadow-[0_2px_4px_rgba(0,120,212,0.3)] hover:shadow-[0_4px_8px_rgba(0,120,212,0.4)]"
                >
                  {editingCount ? 'Update' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelFutureCountForm}
                  className="px-4 py-2 border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 rounded-sm hover:bg-[#F3F2F1] dark:hover:bg-[#353535] active:scale-95 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {futureCounts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No scheduled counts. Click "Add Scheduled Count" to schedule a future count.
          </div>
        ) : (
          <div className="overflow-auto border border-[#EDEBE9] dark:border-[#404040] rounded-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-[#F3F2F1] dark:bg-[#353535] border-b border-[#EDEBE9] dark:border-[#404040]">
                <tr>
                  <th className="p-3 text-left font-semibold text-gray-800 dark:text-gray-200">Date</th>
                  <th className="p-3 text-left font-semibold text-gray-800 dark:text-gray-200">Company</th>
                  <th className="p-3 text-left font-semibold text-gray-800 dark:text-gray-200">Warehouse</th>
                  <th className="p-3 text-left font-semibold text-gray-800 dark:text-gray-200">Notes</th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {futureCounts.map((count) => {
                  const countDate = new Date(count.date);
                  const formattedDate = countDate.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                  });
                  const isPast = countDate < new Date();
                  
                  return (
                    <tr 
                      key={count.id} 
                      className={`border-b border-[#EDEBE9] dark:border-[#404040] hover:bg-[#F3F2F1] dark:hover:bg-[#353535] transition-colors ${isPast ? 'opacity-60' : ''}`}
                    >
                      <td className="p-3 text-gray-800 dark:text-gray-300">
                        {formattedDate}
                        {isPast && <span className="ml-2 text-xs text-gray-500">(Past)</span>}
                      </td>
                      <td className="p-3 text-gray-800 dark:text-gray-300">{count.company || '-'}</td>
                      <td className="p-3 text-gray-800 dark:text-gray-300">{count.warehouse || '-'}</td>
                      <td className="p-3 text-gray-800 dark:text-gray-300">{count.notes || '-'}</td>
                      <td className="p-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleEditFutureCount(count)}
                            className="px-2 py-1 text-xs border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 rounded-sm hover:bg-[#F3F2F1] dark:hover:bg-[#353535] active:scale-95 transition-all"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteFutureCount(count.id)}
                            className="px-2 py-1 text-xs border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#1a1a1a] text-red-600 dark:text-red-400 rounded-sm hover:bg-[#F3F2F1] dark:hover:bg-[#353535] active:scale-95 transition-all"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historical Counts Summary */}
      <div className="bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Historical Counts Summary</h3>
          <div className="flex gap-2">
            <button
              onClick={downloadHistoricalCountsCSV}
              className="px-3 py-1.5 text-sm border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 rounded-sm hover:bg-[#F3F2F1] dark:hover:bg-[#353535] active:scale-95 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
            >
              Download CSV
            </button>
            <button
              onClick={loadHistoricalCountsData}
              disabled={loading}
              className="px-3 py-1.5 text-sm border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 rounded-sm hover:bg-[#F3F2F1] dark:hover:bg-[#353535] disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading historical counts...</div>
        ) : historicalCounts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">No historical counts found</div>
        ) : (
          <div className="overflow-auto border border-[#EDEBE9] dark:border-[#404040] rounded-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-[#F3F2F1] dark:bg-[#353535] border-b border-[#EDEBE9] dark:border-[#404040]">
                <tr>
                  <th className="p-3 text-left font-semibold text-gray-800 dark:text-gray-200">Date</th>
                  <th className="p-3 text-left font-semibold text-gray-800 dark:text-gray-200">Company</th>
                  <th className="p-3 text-left font-semibold text-gray-800 dark:text-gray-200">Warehouse</th>
                  <th className="p-3 text-left font-semibold text-gray-800 dark:text-gray-200">Person</th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-gray-200">Nett Variance</th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-gray-200">Nett Variance Value</th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-gray-200">Absolute Variance</th>
                  <th className="p-3 text-right font-semibold text-gray-800 dark:text-gray-200">Total Stock Value</th>
                </tr>
              </thead>
              <tbody>
                {historicalCounts.map((count, idx) => (
                  <tr key={idx} className="border-b border-[#EDEBE9] dark:border-[#404040] hover:bg-[#F3F2F1] dark:hover:bg-[#353535] transition-colors">
                    <td className="p-3 text-gray-800 dark:text-gray-300">{count.date || '-'}</td>
                    <td className="p-3 text-gray-800 dark:text-gray-300">{count.company || '-'}</td>
                    <td className="p-3 text-gray-800 dark:text-gray-300">{count.warehouse || '-'}</td>
                    <td className="p-3 text-gray-800 dark:text-gray-300">{count.person || '-'}</td>
                    <td className="p-3 text-right text-gray-800 dark:text-gray-300">{count.nettVariance?.toFixed(2) || '-'}</td>
                    <td className="p-3 text-right text-gray-800 dark:text-gray-300">
                      {count.nettVarianceValue ? `R ${count.nettVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="p-3 text-right text-gray-800 dark:text-gray-300">{count.absoluteVariance?.toFixed(2) || '-'}</td>
                    <td className="p-3 text-right text-gray-800 dark:text-gray-300">
                      {count.totalStockValue ? `R ${count.totalStockValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

