import { useMemo, useState, useEffect } from 'react';
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
  const [showOnlyVariance, setShowOnlyVariance] = useState(false);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshingExcel, setRefreshingExcel] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState('');

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
      console.warn('No count rows parsed; first 200 chars:', (countsCsv || '').slice(0, 200));
      alert('No count rows detected. Please refresh Excel data or upload a file.');
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

  // Load synced Excel data from sessionStorage on mount
  useEffect(() => {
    const syncedData = sessionStorage.getItem('uploadedCountsFileContent');
    if (syncedData) {
      setCountsCsv(syncedData);
      // Parse to get row count
      const lines = syncedData.split(/\r?\n/).filter(Boolean);
      setRowsParsedCounts(lines.length > 1 ? lines.length - 1 : 0); // Subtract header if present
    }
  }, []);

  async function handleRefreshExcel() {
    setRefreshingExcel(true);
    setRefreshProgress('Opening Excel...');
    
    // Progress updates during the refresh process
    const progressSteps = [
      { delay: 0, message: 'Opening Excel...' },
      { delay: 2000, message: 'Running macro RefreshAllData...' },
      { delay: 5000, message: 'Waiting for data refresh to complete...' },
      { delay: 10000, message: 'Reading data from worksheet...' },
    ];
    
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - (window.excelRefreshStartTime || Date.now());
      window.excelRefreshStartTime = window.excelRefreshStartTime || Date.now();
      
      // Update progress based on elapsed time
      for (let i = progressSteps.length - 1; i >= 0; i--) {
        if (elapsed >= progressSteps[i].delay) {
          setRefreshProgress(progressSteps[i].message);
          break;
        }
      }
    }, 1000);
    
    try {
      window.excelRefreshStartTime = Date.now();
      const response = await api.post('/api/excel/refresh');
      
      clearInterval(progressInterval);
      
      if (response.data.success && response.data.csvContent) {
        setRefreshProgress('Processing data...');
        // Store the refreshed data in sessionStorage and update countsCsv
        setCountsCsv(response.data.csvContent);
        sessionStorage.setItem('uploadedCountsFileContent', response.data.csvContent);
        
        // Parse to get row count
        const lines = response.data.csvContent.split(/\r?\n/).filter(Boolean);
        setRowsParsedCounts(lines.length > 1 ? lines.length - 1 : 0); // Subtract header if present
        
        setRefreshProgress('');
      } else {
        setRefreshProgress('');
        alert(`Error: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Error refreshing Excel:', error);
      setRefreshProgress('');
      alert(`Error: ${error.response?.data?.message || error.message || 'Failed to refresh Excel'}`);
    } finally {
      setRefreshingExcel(false);
      window.excelRefreshStartTime = null;
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

  // Render variance output grouped by bin location (similar to Summary page)
  function renderVarianceOutput() {
    if (variances.length === 0) return null;
    
    const variancesWithVariance = variances.filter(v => v.variance !== 0);
    
    // Group by bin location
    const byBinLocation = new Map();
    const noBinLocation = [];
    
    variancesWithVariance.forEach(v => {
      const binLocs = v.binLocations || [];
      if (binLocs.length === 0) {
        noBinLocation.push(v);
      } else {
        binLocs.forEach(bin => {
          if (!byBinLocation.has(bin)) {
            byBinLocation.set(bin, []);
          }
          byBinLocation.get(bin).push(v);
        });
      }
    });
    
    // Sort bin locations
    const sortedBins = Array.from(byBinLocation.keys()).sort();
    
    // Pagination for bin locations
    const binsPerPage = itemsPerPage;
    const totalPagesBins = Math.max(1, Math.ceil(sortedBins.length / binsPerPage));
    const startIdx = (currentPage - 1) * binsPerPage;
    const endIdx = startIdx + binsPerPage;
    const paginatedBins = sortedBins.slice(startIdx, endIdx);
    
    return (
      <div className="mt-6 bg-white rounded-sm border border-[#EDEBE9] shadow-sm">
        <button
          onClick={() => setOutputCollapsed(!outputCollapsed)}
          className="w-full flex items-center justify-between p-4 border-b border-[#EDEBE9] hover:bg-[#F3F2F1] transition-colors"
        >
          <h3 className="text-base font-semibold text-gray-800">Items with Variance (Grouped by Bin Location)</h3>
          <span className="text-gray-600 text-sm">
            {outputCollapsed ? '▼' : '▲'}
          </span>
        </button>
        {!outputCollapsed && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div></div>
              {sortedBins.length > binsPerPage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-[#C8C6C4] bg-white text-gray-700 rounded-sm hover:bg-[#F3F2F1] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {totalPagesBins}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPagesBins, currentPage + 1))}
                    disabled={currentPage === totalPagesBins}
                    className="px-3 py-1.5 border border-[#C8C6C4] bg-white text-gray-700 rounded-sm hover:bg-[#F3F2F1] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                  >
                    Next
                  </button>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1.5 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] text-sm"
                  >
                    <option value={5}>5 per page</option>
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                  </select>
                </div>
              )}
            </div>
            
            {/* Items grouped by bin location */}
            {paginatedBins.map((bin, binIdx) => {
              const itemsInBin = byBinLocation.get(bin);
              const binVariance = itemsInBin.reduce((sum, v) => sum + v.variance, 0);
              const binVarianceValue = itemsInBin.reduce((sum, v) => sum + (v.varianceValue || 0), 0);
              
              return (
                <div key={binIdx} className="mb-6 bg-[#F3F2F1] rounded-sm border border-[#EDEBE9]">
                  <div className="bg-white px-4 py-3 border-b border-[#EDEBE9]">
                    <h4 className="font-semibold text-[#0078D4]">Bin Location: {bin}</h4>
                    <div className="text-xs text-gray-600 mt-1">
                      {itemsInBin.length} item(s) | 
                      Variance: <span className={binVariance < 0 ? 'text-[#D13438]' : 'text-[#107C10]'}>
                        {binVariance > 0 ? '+' : ''}{binVariance.toLocaleString()}
                      </span>
                      {' | '}
                      Value: <span className={binVarianceValue < 0 ? 'text-[#D13438]' : 'text-[#107C10]'}>
                        R {binVarianceValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-auto border-t border-[#EDEBE9] bg-white">
                    <table className="min-w-full text-sm">
                      <thead className="bg-[#0078D4] text-white">
                        <tr>
                          <th className="p-2 text-left font-medium">Item Code</th>
                          <th className="p-2 text-left font-medium">Item Name</th>
                          <th className="p-2 text-right font-medium">Book</th>
                          <th className="p-2 text-right font-medium">Counted</th>
                          <th className="p-2 text-right font-medium">Variance</th>
                          <th className="p-2 text-right font-medium">Unit Price</th>
                          <th className="p-2 text-right font-medium">Variance Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsInBin.map((v, idx) => (
                          <tr 
                            key={`${bin}-${idx}`}
                            className={`border-b border-[#EDEBE9] hover:bg-[#F3F2F1] ${v.variance < 0 ? 'bg-[#FDF6F6]' : 'bg-[#F6FDF6]'}`}
                          >
                            <td className="p-2 text-gray-800">{v.itemCode}</td>
                            <td className="p-2 text-gray-800">{v.itemName || '-'}</td>
                            <td className="p-2 text-right text-gray-800">{v.book.toLocaleString()}</td>
                            <td className="p-2 text-right text-gray-800">{v.counted.toLocaleString()}</td>
                            <td className={`p-2 text-right font-semibold ${v.variance < 0 ? 'text-[#D13438]' : 'text-[#107C10]'}`}>
                              {v.variance > 0 ? '+' : ''}{v.variance.toLocaleString()}
                            </td>
                            <td className="p-2 text-right text-gray-800">R {(v.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className={`p-2 text-right font-semibold ${v.varianceValue < 0 ? 'text-[#D13438]' : 'text-[#107C10]'}`}>
                              {v.varianceValue > 0 ? '+' : ''}R {(v.varianceValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            
            {/* Pagination info */}
            {sortedBins.length > binsPerPage && (
              <div className="mt-4 text-center text-sm text-gray-600 bg-[#F3F2F1] px-3 py-2 rounded-sm">
                Showing {startIdx + 1}-{Math.min(endIdx, sortedBins.length)} of {sortedBins.length} bin locations
              </div>
            )}
            
            {/* Items without bin location */}
            {noBinLocation.length > 0 && (
              <div className="mb-6 bg-[#F3F2F1] rounded-sm border border-[#EDEBE9]">
                <div className="bg-white px-4 py-3 border-b border-[#EDEBE9]">
                  <h4 className="font-semibold text-gray-800">No Bin Location</h4>
                  <div className="text-xs text-gray-600 mt-1">
                    {noBinLocation.length} item(s)
                  </div>
                </div>
                <div className="overflow-auto border-t border-[#EDEBE9] bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[#0078D4] text-white">
                      <tr>
                        <th className="p-2 text-left font-medium">Item Code</th>
                        <th className="p-2 text-left font-medium">Item Name</th>
                        <th className="p-2 text-right font-medium">Book</th>
                        <th className="p-2 text-right font-medium">Counted</th>
                        <th className="p-2 text-right font-medium">Variance</th>
                        <th className="p-2 text-right font-medium">Unit Price</th>
                        <th className="p-2 text-right font-medium">Variance Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {noBinLocation.map((v, idx) => (
                        <tr 
                          key={`no-bin-${idx}`}
                          className={`border-b border-[#EDEBE9] hover:bg-[#F3F2F1] ${v.variance < 0 ? 'bg-[#FDF6F6]' : 'bg-[#F6FDF6]'}`}
                        >
                          <td className="p-2 text-gray-800">{v.itemCode}</td>
                          <td className="p-2 text-gray-800">{v.itemName || '-'}</td>
                          <td className="p-2 text-right text-gray-800">{v.book.toLocaleString()}</td>
                          <td className="p-2 text-right text-gray-800">{v.counted.toLocaleString()}</td>
                          <td className={`p-2 text-right font-semibold ${v.variance < 0 ? 'text-[#D13438]' : 'text-[#107C10]'}`}>
                            {v.variance > 0 ? '+' : ''}{v.variance.toLocaleString()}
                          </td>
                          <td className="p-2 text-right text-gray-800">R {(v.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className={`p-2 text-right font-semibold ${v.varianceValue < 0 ? 'text-[#D13438]' : 'text-[#107C10]'}`}>
                            {v.varianceValue > 0 ? '+' : ''}R {(v.varianceValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {/* Grand Total */}
            {variancesWithVariance.length > 0 && (
              <div className="mt-4 p-4 bg-white border border-[#EDEBE9] rounded-sm">
                <div className="text-sm">
                  <span className="font-semibold text-gray-800">Grand Total:</span>{' '}
                  <span className="text-gray-600">
                    {variancesWithVariance.length} item(s) | 
                    Variance: <span className={variancesWithVariance.reduce((s,v) => s + v.variance, 0) < 0 ? 'text-[#D13438]' : 'text-[#107C10]'}>
                      {variancesWithVariance.reduce((s,v) => s + v.variance, 0).toLocaleString()}
                    </span>
                    {' | '}
                    Value: <span className={variancesWithVariance.reduce((s,v) => s + (v.varianceValue || 0), 0) < 0 ? 'text-[#D13438]' : 'text-[#107C10]'}>
                      R {variancesWithVariance.reduce((s,v) => s + (v.varianceValue || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </span>
                </div>
              </div>
            )}
            
            {variancesWithVariance.length === 0 && (
              <div className="p-4 text-center text-gray-600 border border-[#EDEBE9] bg-[#F3F2F1] rounded-sm">No items with variance found.</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-800 mb-1">Reconcile (Journal vs Stock Counts)</h2>
        <p className="text-sm text-gray-600">Compare and reconcile stock counts with journal entries</p>
      </div>
      
      <div className="bg-white rounded-sm border border-[#EDEBE9] shadow-sm p-6 grid gap-4 sm:max-w-4xl">
        <div className="border-b border-[#EDEBE9] pb-4 mb-4">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Upload Files</h3>
        </div>
        
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Upload/paste Journal (Book)</h3>
            {!!rowsParsedJournal && (
              <div className="text-xs text-gray-600 bg-[#F3F2F1] px-2 py-1 rounded-sm">Journal rows: {rowsParsedJournal}</div>
            )}
          </div>
          <input 
            type="file" 
            accept=".csv,text/csv" 
            onChange={handleJournalFile}
            className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] file:mr-4 file:py-1.5 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-medium file:bg-[#0078D4] file:text-white hover:file:bg-[#106EBE] cursor-pointer"
          />
          <textarea 
            className="min-h-[120px] px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] resize-none" 
            value={journalCsv} 
            onChange={e=>setJournalCsv(e.target.value)} 
            placeholder="Paste Journal CSV/Excel export here. Expected headers include Item Code and Book/On Hand."
          />
        </div>
        
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Stock Count Data (Counted)</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshExcel}
                disabled={refreshingExcel}
                className="px-3 py-1.5 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium transition-colors"
              >
                {refreshingExcel ? 'Refreshing...' : 'Refresh Excel'}
              </button>
              {refreshingExcel && refreshProgress && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-[#0078D4]"></div>
                  <span>{refreshProgress}</span>
                </div>
              )}
            </div>
          </div>
          {!!rowsParsedCounts && (
            <div className="text-xs text-gray-600 bg-[#F3F2F1] px-2 py-1 rounded-sm">Count rows: {rowsParsedCounts}</div>
          )}
          <div className="text-xs text-gray-500 mb-1">
            {countsCsv ? 'Using synced Excel data. You can also upload a file to override.' : 'No synced data available. Refresh Excel or upload a file.'}
          </div>
          <input 
            type="file" 
            accept=".csv,text/csv" 
            onChange={handleCountsFile}
            className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] file:mr-4 file:py-1.5 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-medium file:bg-[#0078D4] file:text-white hover:file:bg-[#106EBE] cursor-pointer"
          />
          <textarea 
            className="min-h-[160px] px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] resize-none" 
            value={countsCsv} 
            onChange={e=>setCountsCsv(e.target.value)} 
            placeholder="Stock count data from Excel (synced automatically) or paste CSV data here. Headers like Item Code and Counted/Quantity."
          />
        </div>
        
        <div className="flex gap-3 pt-2">
          <button onClick={preview} className="px-4 py-2 border border-[#C8C6C4] bg-white text-gray-700 rounded-sm hover:bg-[#F3F2F1] font-medium transition-colors text-sm">Preview variances</button>
          <button onClick={apply} className="px-4 py-2 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] font-medium transition-colors text-sm">Apply adjustments</button>
        </div>
      </div>

      {/* Summary Variance Report */}
      {variances.length > 0 && (
        <div className="bg-white rounded-sm border border-[#EDEBE9] shadow-sm">
          <button
            onClick={() => setSummaryCollapsed(!summaryCollapsed)}
            className="w-full flex items-center justify-between p-4 border-b border-[#EDEBE9] hover:bg-[#F3F2F1] transition-colors"
          >
            <h3 className="text-base font-semibold text-gray-800">Variance Summary Reports</h3>
            <span className="text-gray-600 text-sm">
              {summaryCollapsed ? '▼' : '▲'}
            </span>
          </button>
          {!summaryCollapsed && (
            <div className="p-6 grid gap-4">
              {/* Variance Amount Report */}
              <div className="overflow-auto border border-[#EDEBE9] rounded-sm">
                <h3 className="p-3 bg-[#0078D4] text-white font-semibold">Variance Amount Report</h3>
                <table className="min-w-full text-sm">
                  <thead className="bg-[#0078D4] text-white">
                    <tr>
                      <th className="p-2 text-left font-medium">Description</th>
                      <th className="p-2 text-right font-medium">Amount</th>
                      <th className="p-2 text-right font-medium">Total Stock Value</th>
                      <th className="p-2 text-right font-medium">Nett Variance</th>
                      <th className="p-2 text-right font-medium">Absolute Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Negative Variance</td>
                      <td className="p-2 text-right font-semibold text-[#D13438]">{varianceSummary.negativeVariance.toFixed(2)}</td>
                      <td className="p-2 text-right text-gray-800" rowSpan={6}>{varianceSummary.totalStockValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                    </tr>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Positive Variance</td>
                      <td className="p-2 text-right font-semibold text-[#107C10]">{varianceSummary.positiveVariance.toFixed(2)}</td>
                      <td className="p-2 text-right text-gray-800">{varianceSummary.nettVariance.toFixed(2)}</td>
                      <td className="p-2 text-right text-gray-800">{varianceSummary.absoluteVariance.toFixed(2)}</td>
                    </tr>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Percentage Variance</td>
                      <td className="p-2 text-right text-gray-800">{varianceSummary.percentageVariance.toFixed(2)}%</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                    </tr>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Percentage Absolute Variance</td>
                      <td className="p-2 text-right text-gray-800">{varianceSummary.percentageAbsoluteVariance.toFixed(2)}%</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                    </tr>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Line Variance</td>
                      <td className="p-2 text-right text-gray-800">{varianceSummary.lineVariance}</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                    </tr>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Line Percentage Variance</td>
                      <td className="p-2 text-right text-gray-800">{varianceSummary.linePercentageVariance.toFixed(2)}%</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Variance Value Report */}
              <div className="overflow-auto border border-[#EDEBE9] rounded-sm">
                <h3 className="p-3 bg-[#107C10] text-white font-semibold">Variance Value Report</h3>
                <table className="min-w-full text-sm">
                  <thead className="bg-[#107C10] text-white">
                    <tr>
                      <th className="p-2 text-left font-medium">Description</th>
                      <th className="p-2 text-right font-medium">Amount</th>
                      <th className="p-2 text-right font-medium">Total Stock Value</th>
                      <th className="p-2 text-right font-medium">Nett Variance</th>
                      <th className="p-2 text-right font-medium">Absolute Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Negative Variance</td>
                      <td className="p-2 text-right font-semibold text-[#D13438]">R {varianceSummary.negativeVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right text-gray-800" rowSpan={6}>R {varianceSummary.totalStockValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                    </tr>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Positive Variance</td>
                      <td className="p-2 text-right font-semibold text-[#107C10]">R {varianceSummary.positiveVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right text-gray-800">R {varianceSummary.nettVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="p-2 text-right text-gray-800">R {varianceSummary.absoluteVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Percentage Variance</td>
                      <td className="p-2 text-right text-gray-800">{varianceSummary.percentageVariance.toFixed(2)}%</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                    </tr>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Percentage Absolute Variance</td>
                      <td className="p-2 text-right text-gray-800">{varianceSummary.percentageAbsoluteVariance.toFixed(2)}%</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                    </tr>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Line Variance</td>
                      <td className="p-2 text-right text-gray-800">{varianceSummary.lineVariance}</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                    </tr>
                    <tr className="border-t border-[#EDEBE9]">
                      <td className="p-2 text-gray-800">Line Percentage Variance</td>
                      <td className="p-2 text-right text-gray-800">{varianceSummary.linePercentageVariance.toFixed(2)}%</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                      <td className="p-2 text-right text-gray-800">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Items with Variance (Grouped by Bin Location) */}
      {variances.length > 0 && renderVarianceOutput()}
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


