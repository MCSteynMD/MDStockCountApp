import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Stock() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const { data } = await api.get('/api/stock?page=1&limit=10');
        setItems(data.stockItems || []);
      } catch (e) {
        setError('Failed to load stock. Make sure you are logged in.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-semibold">Stock Control</h2>
      {loading && <div>Loading...</div>}
      {error && <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>}
      {!loading && !error && (
        <div className="overflow-auto border border-gray-200 dark:border-gray-800 rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Category</th>
                <th className="text-right p-2">Stock</th>
                <th className="text-right p-2">Min</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it._id} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2 font-mono">{it.itemCode}</td>
                  <td className="p-2">{it.itemName}</td>
                  <td className="p-2">{it.category}</td>
                  <td className="p-2 text-right">{it.currentStock}</td>
                  <td className="p-2 text-right">{it.minimumStock}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td className="p-3 text-center text-gray-500 dark:text-gray-400" colSpan={5}>No items</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


