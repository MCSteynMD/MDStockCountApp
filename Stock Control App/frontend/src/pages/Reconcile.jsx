import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { parseCountsToJson, parseJournalToJson } from '../lib/parser';
import PasswordProtect from '../components/PasswordProtect';

function ReconcileContent() {
  const [journalCsv, setJournalCsv] = useState('');
  const [countsCsv, setCountsCsv] = useState('');
  const [variances, setVariances] = useState([]);
  const [rowsParsedJournal, setRowsParsedJournal] = useState(0);
  const [rowsParsedCounts, setRowsParsedCounts] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [spStatus, setSpStatus] = useState(null);
  const [loadingSharePoint, setLoadingSharePoint] = useState(false);
  const [showOnlyVariance, setShowOnlyVariance] = useState(false);

  // Helper to parse a line with quoted fields
  function splitQuotedLine(line, delimiter) {
    if (delimiter === ',') {
      // CSV with quoted fields
      const fields = [];
      let current = '';
      let insideQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (insideQuotes && nextChar === '"') {
            // Escaped quote ("")
            current += '"';
            i++; // Skip next quote
          } else {
            // Toggle quote state
            insideQuotes = !insideQuotes;
          }
        } else if (char === delimiter && !insideQuotes) {
          // Field separator outside quotes
          fields.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      
      // Add the last field
      fields.push(current);
      return fields;
    }
    
    // For other delimiters, check for quotes
    if (line.includes('"')) {
      const fields = [];
      let current = '';
      let insideQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (insideQuotes && nextChar === '"') {
            current += '"';
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === delimiter && !insideQuotes) {
          fields.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      
      fields.push(current);
      return fields;
    }
    
    // Simple split for unquoted lines
    return line.split(delimiter);
  }

  function parseCsv(text) {
    // Fallback simple parser for headerless CSV/TSV/semicolon: code,qty[,name]
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return [];
    const delimiter = text.includes('\t') ? '\t' : (text.includes(';') ? ';' : ',');
    // Detect header by common names (using quoted-aware parsing)
    const headerTokens = splitQuotedLine(lines[0], delimiter).map(t => t.trim().replace(/^"|"$/g, '').toLowerCase());
    const isHeader = headerTokens.some(t => ['itemcode','item_code','barcode','code','sku','counted','quantity','qty'].includes(t));
    const start = isHeader ? 1 : 0;
    const rows = [];
    for (let i = start; i < lines.length; i++) {
      let tokens = splitQuotedLine(lines[i], delimiter).map(s => {
        // Remove surrounding quotes and trim
        const trimmed = s.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1).replace(/""/g, '"'); // Handle escaped quotes
        }
        return trimmed;
      });
      while (tokens.length && tokens[0] === '') tokens.shift();
      if (tokens.length === 0) continue;
      const code = tokens[0];
      const counted = Number(tokens[1] || 0);
      const itemName = tokens.slice(2).filter(Boolean).join(' ');
      if (!code) continue;
      rows.push({ itemCode: code, counted, itemName: itemName || undefined });
    }
    return rows;
  }

  async function preview() {
    const countsParsed = parseCountsToJson(countsCsv);
    let entries = countsParsed.entries.length ? countsParsed.entries : parseCsv(countsCsv);
    const journalParsed = parseJournalToJson(journalCsv);
    const bookEntries = journalParsed.entries || [];
    setRowsParsedCounts(entries.length);
    setRowsParsedJournal(bookEntries.length);
    if (!entries.length) {
      console.warn('No SharePoint rows parsed; first 200 chars:', (countsCsv || '').slice(0, 200));
      alert('No SharePoint count rows detected. Paste or upload the SharePoint list export.');
      return;
    }
    
    // Debug: log what we're sending
    console.log('Sending bookEntries to backend:', bookEntries.slice(0, 3).map(b => ({
      itemCode: b.itemCode,
      book: b.book,
      costPrice: b.costPrice
    })));
    
    try {
      const { data } = await api.post('/api/reconcile/preview', { entries, bookEntries });
      setVariances(data.variances || []);
      setPage(1);
    } catch (error) {
      if (error.response?.status === 401) {
        alert('Please login first. Use the "Quick login (admin)" button on the Home page.');
      } else {
        console.error('Preview error:', error);
        alert('Failed to preview variances. Check console for details.');
      }
    }
  }

  async function apply() {
    if (!confirm('Apply adjustments to match counted quantities?')) return;
    const countsParsed = parseCountsToJson(countsCsv);
    let entries = countsParsed.entries.length ? countsParsed.entries : parseCsv(countsCsv);
    const journalParsed = parseJournalToJson(journalCsv);
    const bookEntries = journalParsed.entries || [];
    if (!entries.length) {
      alert('No rows detected to apply. Preview first or check your input.');
      return;
    }
    const { data } = await api.post('/api/reconcile/apply', { entries, bookEntries });
    setVariances(data.variances || []);
    alert('Adjustments applied.');
  }

  function handleCountsFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCountsCsv(String(reader.result || ''));
    reader.readAsText(file);
  }

  function handleJournalFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setJournalCsv(String(reader.result || ''));
    reader.readAsText(file);
  }

  async function checkSharePointStatus() {
    try {
      const { data } = await api.get('/api/sharepoint/status');
      setSpStatus(data);
    } catch (e) {
      setSpStatus({ enabled: false, configured: false, stub: false });
    }
  }

  async function fetchSharePointCounts() {
    setLoadingSharePoint(true);
    try {
      const { data } = await api.post('/api/sharepoint/fetch', { type: 'counts' });
      const entries = Array.isArray(data.entries) ? data.entries : [];
      // Convert to CSV text for the textarea to keep current flow
      const header = 'itemCode,counted';
      const body = entries.map(e => `${e.itemCode || ''},${e.counted != null ? e.counted : ''}`).join('\n');
      setCountsCsv([header, body].filter(Boolean).join('\n'));
      setRowsParsedCounts(entries.length);
    } catch (e) {
      alert((e?.response?.data?.message) || 'Failed to fetch from SharePoint');
    } finally {
      setLoadingSharePoint(false);
    }
  }

  const totalDelta = useMemo(() => variances.reduce((s,v)=> s + v.variance, 0), [variances]);

  // Calculate summary variance metrics
  const varianceSummary = useMemo(() => {
    if (variances.length === 0) {
      return {
        negativeVariance: 0,
        positiveVariance: 0,
        negativeVarianceValue: 0,
        positiveVarianceValue: 0,
        totalStockValue: 0,
        nettVariance: 0,
        absoluteVariance: 0,
        nettVarianceValue: 0,
        absoluteVarianceValue: 0,
        percentageVariance: 0,
        percentageAbsoluteVariance: 0,
        lineVariance: 0,
        linePercentageVariance: 0,
      };
    }

    const negativeVariance = variances
      .filter(v => v.variance < 0)
      .reduce((sum, v) => sum + Math.abs(v.variance), 0);
    
    const positiveVariance = variances
      .filter(v => v.variance > 0)
      .reduce((sum, v) => sum + v.variance, 0);
    
    const negativeVarianceValue = variances
      .filter(v => v.variance < 0)
      .reduce((sum, v) => sum + Math.abs(v.varianceValue || 0), 0);
    
    const positiveVarianceValue = variances
      .filter(v => v.variance > 0)
      .reduce((sum, v) => sum + (v.varianceValue || 0), 0);
    
    // Total stock value (sum of book * unitPrice)
    const totalStockValue = variances.reduce((sum, v) => {
      const bookValue = (v.book || 0) * (v.unitPrice || 0);
      return sum + bookValue;
    }, 0);
    
    const nettVariance = totalDelta; // Should equal negative - positive
    const absoluteVariance = negativeVariance + positiveVariance;
    
    const nettVarianceValue = variances.reduce((sum, v) => sum + (v.varianceValue || 0), 0);
    const absoluteVarianceValue = negativeVarianceValue + positiveVarianceValue;
    
    const percentageVariance = totalStockValue > 0 
      ? ((nettVarianceValue / totalStockValue) * 100) 
      : 0;
    
    const percentageAbsoluteVariance = totalStockValue > 0
      ? ((absoluteVarianceValue / totalStockValue) * 100)
      : 0;
    
    const lineVariance = variances.filter(v => v.variance !== 0).length;
    const linePercentageVariance = variances.length > 0
      ? ((lineVariance / variances.length) * 100)
      : 0;

    return {
      negativeVariance,
      positiveVariance,
      negativeVarianceValue,
      positiveVarianceValue,
      totalStockValue,
      nettVariance,
      absoluteVariance,
      nettVarianceValue,
      absoluteVarianceValue,
      percentageVariance,
      percentageAbsoluteVariance,
      lineVariance,
      linePercentageVariance,
    };
  }, [variances, totalDelta]);
  
  // Filter variances if needed
  const filteredVariances = useMemo(() => {
    if (showOnlyVariance) {
      return variances.filter(v => v.variance !== 0);
    }
    return variances;
  }, [variances, showOnlyVariance]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredVariances.length / pageSize)), [filteredVariances.length, pageSize]);
  const pageData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredVariances.slice(start, start + pageSize);
  }, [filteredVariances, page, pageSize]);

  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-semibold">Reconcile (Journal vs SharePoint Counts)</h2>
      <div className="grid gap-6 sm:max-w-4xl">
        <div className="flex items-center justify-between">
          <button onClick={checkSharePointStatus} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-xs">Check SharePoint status</button>
          {spStatus && (
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {spStatus.configured ? 'SharePoint configured' : 'SharePoint not configured'}{spStatus.stub ? ' (stub enabled)' : ''}
            </div>
          )}
        </div>
        <div className="grid gap-2">
          <h3 className="font-medium">Upload/paste Journal (Book)</h3>
          {!!rowsParsedJournal && (
            <div className="text-sm text-gray-600 dark:text-gray-400">Journal rows: {rowsParsedJournal}</div>
          )}
          <input type="file" accept=".csv,text/csv" onChange={handleJournalFile} />
          <textarea className="min-h-[120px] px-3 py-2 rounded border border-gray-300 dark:border-gray-700" value={journalCsv} onChange={e=>setJournalCsv(e.target.value)} placeholder={`Paste Journal CSV/Excel export here. Expected headers include Item Code and Book/On Hand.`} />
        </div>
        <div className="grid gap-2">
          <h3 className="font-medium">Upload/paste SharePoint Counts (Source of truth)</h3>
          <div className="flex items-center gap-2">
            <button onClick={fetchSharePointCounts} disabled={loadingSharePoint} className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-xs">
              {loadingSharePoint ? 'Fetching…' : 'Fetch from SharePoint'}
            </button>
            <span className="text-xs text-gray-600 dark:text-gray-400">(uses backend placeholder; auth needed later)</span>
          </div>
          {!!rowsParsedCounts && (
            <div className="text-sm text-gray-600 dark:text-gray-400">SharePoint rows: {rowsParsedCounts}</div>
          )}
          <input type="file" accept=".csv,text/csv" onChange={handleCountsFile} />
          <textarea className="min-h-[160px] px-3 py-2 rounded border border-gray-300 dark:border-gray-700" value={countsCsv} onChange={e=>setCountsCsv(e.target.value)} placeholder={`Paste SharePoint list export here. Headers like Barcode and Quantity/Count.`} />
        </div>
        <div className="flex gap-2">
          <button onClick={preview} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 text-sm">Preview variances</button>
          <button onClick={apply} className="px-3 py-2 rounded bg-blue-600 text-white text-sm">Apply adjustments</button>
        </div>
      </div>

      {/* Summary Variance Report */}
      {variances.length > 0 && (
        <div className="grid gap-4">
          {/* Variance Amount Report */}
          <div className="overflow-auto border border-gray-200 dark:border-gray-800 rounded">
            <h3 className="p-2 bg-blue-600 text-white font-semibold">Variance Amount Report</h3>
            <table className="min-w-full text-sm">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2 text-right">Total Stock Value</th>
                  <th className="p-2 text-right">Nett Variance</th>
                  <th className="p-2 text-right">Absolute Variance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Negative Variance</td>
                  <td className="p-2 text-right font-semibold text-red-600">{varianceSummary.negativeVariance.toFixed(2)}</td>
                  <td className="p-2 text-right" rowSpan={6}>{varianceSummary.totalStockValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right">-</td>
                  <td className="p-2 text-right">-</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Positive Variance</td>
                  <td className="p-2 text-right font-semibold text-green-600">{varianceSummary.positiveVariance.toFixed(2)}</td>
                  <td className="p-2 text-right">{varianceSummary.nettVariance.toFixed(2)}</td>
                  <td className="p-2 text-right">{varianceSummary.absoluteVariance.toFixed(2)}</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Percentage Variance</td>
                  <td className="p-2 text-right">{varianceSummary.percentageVariance.toFixed(2)}%</td>
                  <td className="p-2 text-right">-</td>
                  <td className="p-2 text-right">-</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Percentage Absolute Variance</td>
                  <td className="p-2 text-right">{varianceSummary.percentageAbsoluteVariance.toFixed(2)}%</td>
                  <td className="p-2 text-right">-</td>
                  <td className="p-2 text-right">-</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Line Variance</td>
                  <td className="p-2 text-right">{varianceSummary.lineVariance}</td>
                  <td className="p-2 text-right">-</td>
                  <td className="p-2 text-right">-</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Line Percentage Variance</td>
                  <td className="p-2 text-right">{varianceSummary.linePercentageVariance.toFixed(2)}%</td>
                  <td className="p-2 text-right">-</td>
                  <td className="p-2 text-right">-</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Variance Value Report */}
          <div className="overflow-auto border border-gray-200 dark:border-gray-800 rounded">
            <h3 className="p-2 bg-green-600 text-white font-semibold">Variance Value Report</h3>
            <table className="min-w-full text-sm">
              <thead className="bg-green-600 text-white">
                <tr>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2 text-right">Total Stock Value</th>
                  <th className="p-2 text-right">Nett Variance</th>
                  <th className="p-2 text-right">Absolute Variance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Negative Variance</td>
                  <td className="p-2 text-right font-semibold text-red-600">{varianceSummary.negativeVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right" rowSpan={6}>{varianceSummary.totalStockValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right">-</td>
                  <td className="p-2 text-right">-</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Positive Variance</td>
                  <td className="p-2 text-right font-semibold text-green-600">{varianceSummary.positiveVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right">{varianceSummary.nettVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right">{varianceSummary.absoluteVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Percentage Variance</td>
                  <td className="p-2 text-right">{varianceSummary.percentageVariance.toFixed(2)}%</td>
                  <td className="p-2 text-right">-</td>
                  <td className="p-2 text-right">-</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Percentage Absolute Variance</td>
                  <td className="p-2 text-right">{varianceSummary.percentageAbsoluteVariance.toFixed(2)}%</td>
                  <td className="p-2 text-right">-</td>
                  <td className="p-2 text-right">-</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Line Variance</td>
                  <td className="p-2 text-right">{varianceSummary.lineVariance}</td>
                  <td className="p-2 text-right">-</td>
                  <td className="p-2 text-right">-</td>
                </tr>
                <tr className="border-t border-gray-200 dark:border-gray-800">
                  <td className="p-2">Line Percentage Variance</td>
                  <td className="p-2 text-right">{varianceSummary.linePercentageVariance.toFixed(2)}%</td>
                  <td className="p-2 text-right">-</td>
                  <td className="p-2 text-right">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOnlyVariance}
              onChange={(e) => {
                setShowOnlyVariance(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-gray-600 dark:text-gray-400">Show only items with variance</span>
          </label>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {filteredVariances.length ? ((page - 1) * pageSize + 1) : 0}–{Math.min(page * pageSize, filteredVariances.length)} of {filteredVariances.length}
            {showOnlyVariance && ` (${variances.length} total)`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</button>
          <span className="text-sm">Page {page} / {totalPages}</span>
          <button className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button>
          <select className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600" value={pageSize} onChange={e=>{ setPageSize(Number(e.target.value)); setPage(1); }}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={250}>250</option>
          </select>
        </div>
      </div>

      <div className="overflow-auto border border-gray-200 dark:border-gray-800 rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="p-2 text-left">Code</th>
              <th className="p-2 text-left">Name</th>
              <th className="p-2 text-right">Book</th>
              <th className="p-2 text-right">Counted</th>
              <th className="p-2 text-right">Unit Price</th>
              <th className="p-2 text-right">Variance Amount</th>
              <th className="p-2 text-right">Variance Value</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map(v => (
              <tr key={v.itemCode} className="border-t border-gray-200 dark:border-gray-800">
                <td className="p-2 font-mono">{v.itemCode}</td>
                <td className="p-2">{v.itemName || '-'}</td>
                <td className="p-2 text-right">{v.book}</td>
                <td className="p-2 text-right">{v.counted}</td>
                <td className="p-2 text-right">{(v.unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className={`p-2 text-right ${v.variance===0?'':'font-semibold'} ${v.variance>0?'text-green-600':'text-red-600'}`}>{v.variance}</td>
                <td className={`p-2 text-right ${v.variance===0?'':'font-semibold'} ${v.variance>0?'text-green-600':'text-red-600'}`}>
                  {(v.varianceValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            {filteredVariances.length === 0 && (
              <tr><td className="p-3 text-center text-gray-500 dark:text-gray-400" colSpan={7}>
                {showOnlyVariance ? 'No items with variance found' : 'No data'}
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 dark:border-gray-800">
              <td className="p-2" colSpan={5}>Total variance</td>
              <td className={`p-2 text-right ${totalDelta===0?'':'font-semibold'} ${totalDelta>0?'text-green-600':'text-red-600'}`}>{totalDelta}</td>
              <td className={`p-2 text-right ${varianceSummary.nettVarianceValue===0?'':'font-semibold'} ${varianceSummary.nettVarianceValue>0?'text-green-600':'text-red-600'}`}>
                {varianceSummary.nettVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function Reconcile() {
  return (
    <PasswordProtect>
      <ReconcileContent />
    </PasswordProtect>
  );
}


