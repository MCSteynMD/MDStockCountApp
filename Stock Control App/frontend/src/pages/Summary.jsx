import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { parseCountsToJson, parseJournalToJson } from '../lib/parser';
import jsPDF from 'jspdf';

export default function Summary() {
  const [journalCsv, setJournalCsv] = useState('');
  const [countsCsv, setCountsCsv] = useState('');
  const [variances, setVariances] = useState([]);
  const [rowsParsedJournal, setRowsParsedJournal] = useState(0);
  const [rowsParsedCounts, setRowsParsedCounts] = useState(0);
  const [numberOfGroups, setNumberOfGroups] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [groupsCollapsed, setGroupsCollapsed] = useState(false);
  const [uploadCollapsed, setUploadCollapsed] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [filterCompanyCode, setFilterCompanyCode] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('');
  const [filterCompanyName, setFilterCompanyName] = useState('');

  // Load stored file content and filter selections on mount
  useEffect(() => {
    try {
      // Load filter selections from sessionStorage
      const storedCompany = sessionStorage.getItem('company') || '';
      const storedWarehouse = sessionStorage.getItem('warehouse') || '';
      const storedDate = sessionStorage.getItem('selectedDate') || '';
      const storedCompanyName = sessionStorage.getItem('selectedCompanyName') || '';
      
      setFilterCompanyCode(storedCompany);
      setFilterWarehouse(storedWarehouse);
      setFilterDate(storedDate);
      if (storedCompanyName) {
        setFilterCompanyName(storedCompanyName);
      }
      
      // Get company name from parsed options if available, or use code as fallback
      // We'll need to get this from the backend or the parsed stock take codes
      // For now, we'll reconstruct it from the stock take codes in the file
      
      const storedCountsFile = sessionStorage.getItem('uploadedCountsFileContent');
      if (storedCountsFile) {
        setCountsCsv(storedCountsFile);
        // Parse the stored file to get row count
        const parsed = parseCountsToJson(storedCountsFile);
        setRowsParsedCounts(parsed.entries?.length || 0);
        console.log('Loaded stored counts file from sessionStorage');
        
        // Extract company name from stock take codes in the file
        if (storedCompany && storedDate && storedWarehouse) {
          // Build expected stock take code: COMPANYNAMEDATEWAREHOUSE
          // Look for entries that match the warehouse and date
          const matchingEntry = parsed.entries.find(e => {
            const code = e.raw?.stockTakeCode;
            if (!code) return false;
            return code.endsWith(storedWarehouse) && code.includes(storedDate);
          });
          
          if (matchingEntry?.raw?.stockTakeCode) {
            // Extract company name from stock take code
            // Format: COMPANYNAMEDATEWAREHOUSE
            const code = matchingEntry.raw.stockTakeCode;
            const companyName = code.slice(0, -12); // Remove date (8) + warehouse (4)
            if (companyName) {
              setFilterCompanyName(companyName);
              console.log('Extracted company name from stock take code:', companyName);
            }
          } else if (matchingEntry?.raw?.company) {
            // Fallback: use company from raw data
            setFilterCompanyName(matchingEntry.raw.company);
            console.log('Using company name from entry raw data:', matchingEntry.raw.company);
          }
        }
      }
    } catch (error) {
      console.error('Error loading stored counts file:', error);
    }
  }, []); // Run once on mount

  // Auto-run preview when both files are loaded
  useEffect(() => {
    const hasCounts = countsCsv.trim().length > 0;
    const hasJournal = journalCsv.trim().length > 0;
    
    if (hasCounts && hasJournal && variances.length === 0) {
      // Only auto-run if we don't already have variances (to avoid re-running unnecessarily)
      console.log('Both files loaded, auto-running preview...', {
        countsLength: countsCsv.length,
        journalLength: journalCsv.length
      });
      const timer = setTimeout(() => {
        preview();
      }, 500); // Increased delay to ensure state is fully updated
      
      return () => clearTimeout(timer); // Cleanup
    }
  }, [countsCsv, journalCsv, variances.length]); // Run when either file changes or variances reset

  // Helper to parse a line with quoted fields
  function splitQuotedLine(line, delimiter) {
    if (delimiter === ',') {
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
    
    return line.split(delimiter);
  }

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return [];
    const delimiter = text.includes('\t') ? '\t' : (text.includes(';') ? ';' : ',');
    const headerTokens = splitQuotedLine(lines[0], delimiter).map(t => t.trim().replace(/^"|"$/g, '').toLowerCase());
    const isHeader = headerTokens.some(t => ['itemcode','item_code','barcode','code','sku','counted','quantity','qty'].includes(t));
    const start = isHeader ? 1 : 0;
    const rows = [];
    for (let i = start; i < lines.length; i++) {
      let tokens = splitQuotedLine(lines[i], delimiter).map(s => {
        const trimmed = s.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1).replace(/""/g, '"');
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

  async function handleJournalFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setJournalCsv(text);
    const parsed = parseJournalToJson(text);
    setRowsParsedJournal(parsed.entries?.length || 0);
    // Auto-run is handled by useEffect
  }

  async function handleCountsFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCountsCsv(text);
    const parsed = parseCountsToJson(text);
    setRowsParsedCounts(parsed.entries?.length || 0);
    // Auto-run is handled by useEffect
  }

  // Build expected stock take code from selections
  function buildExpectedStockTakeCode() {
    if (!filterCompanyName || !filterDate || !filterWarehouse) {
      return null;
    }
    // Format: COMPANYNAMEDATEWAREHOUSE
    // Date should be in DDMMYYYY format (8 chars)
    // Warehouse is last 4 chars
    return `${filterCompanyName}${filterDate}${filterWarehouse}`;
  }

  // Filter entries based on selected company, date, and warehouse
  function filterEntriesBySelection(entries) {
    if (!filterCompanyName || !filterDate || !filterWarehouse) {
      console.log('No filter selections, returning all entries');
      return entries;
    }

    const expectedStockTakeCode = buildExpectedStockTakeCode();
    console.log('Filtering entries:', {
      companyName: filterCompanyName,
      date: filterDate,
      warehouse: filterWarehouse,
      expectedStockTakeCode
    });

    const filtered = entries.filter(entry => {
      const stockTakeCode = entry.raw?.stockTakeCode;
      if (!stockTakeCode) {
        // If no stock take code, check if company, date, and warehouse match individually
        const matchesCompany = !filterCompanyName || 
          (entry.raw?.company && entry.raw.company.toLowerCase().includes(filterCompanyName.toLowerCase()));
        const matchesDate = !filterDate || 
          (entry.raw?.date && entry.raw.date.trim() === filterDate.trim());
        const matchesWarehouse = !filterWarehouse || 
          (entry.raw?.warehouse && entry.raw.warehouse.trim() === filterWarehouse.trim());
        
        return matchesCompany && matchesDate && matchesWarehouse;
      }
      
      // Check if stock take code matches expected pattern
      return stockTakeCode === expectedStockTakeCode ||
        (stockTakeCode.includes(filterDate) && 
         stockTakeCode.endsWith(filterWarehouse) &&
         stockTakeCode.includes(filterCompanyName));
    });

    console.log(`Filtered ${entries.length} entries to ${filtered.length} matching selections`);
    return filtered;
  }

  async function preview() {
    try {
      const journalData = parseJournalToJson(journalCsv);
      const countsData = parseCountsToJson(countsCsv);
      
      const bookEntries = journalData.entries || [];
      let entries = countsData.entries || [];

      if (!entries.length && !countsCsv.trim()) {
        alert('Please upload or paste the counts CSV first.');
        return;
      }
      if (!bookEntries.length && !journalCsv.trim()) {
        alert('Please upload or paste the journal CSV first.');
        return;
      }

      // Filter entries based on selected company, date, and warehouse
      entries = filterEntriesBySelection(entries);

      if (entries.length === 0) {
        alert(`No entries found matching the selected filters:\nCompany: ${filterCompanyName || filterCompanyCode}\nDate: ${filterDate}\nWarehouse: ${filterWarehouse}`);
        return;
      }

      // Debug: log what we're sending
      console.log('Summary - Sending to backend:', {
        entriesCount: entries.length,
        bookEntriesCount: bookEntries.length,
        filterApplied: !!(filterCompanyName && filterDate && filterWarehouse),
        sampleEntry: entries[0],
        sampleEntryRaw: entries[0]?.raw,
        sampleEntryBinLocation: entries[0]?.raw?.binLocation,
        sampleBookEntry: bookEntries[0]
      });
      
      // Verify bin locations are in entries
      const entriesWithBinLoc = entries.filter(e => e.raw?.binLocation);
      console.log(`Entries with binLocation in raw: ${entriesWithBinLoc.length} out of ${entries.length}`);
      if (entriesWithBinLoc.length > 0) {
        console.log('Sample entry with binLocation:', {
          itemCode: entriesWithBinLoc[0].itemCode,
          binLocation: entriesWithBinLoc[0].raw.binLocation
        });
      }

      const res = await api.post('/api/reconcile/preview', {
        entries: entries,
        bookEntries: bookEntries,
      });
      
      setVariances(res.data.variances || []);
    } catch (e) {
      if (e?.response?.status === 401) {
        alert('Please log in first.');
      } else {
        console.error('Preview error:', e);
        alert('Failed to preview: ' + (e?.response?.data?.message || e.message));
      }
    }
  }

  // Render variance output
  function renderVarianceOutput() {
    if (variances.length === 0) return null;
    
    const variancesWithVariance = variances.filter(v => v.variance !== 0);
    
    // Debug: log bin location data
    console.log('Variances with variance:', variancesWithVariance.length);
    const withBinLocs = variancesWithVariance.filter(v => v.binLocations && v.binLocations.length > 0);
    const withoutBinLocs = variancesWithVariance.filter(v => !v.binLocations || v.binLocations.length === 0);
    console.log(`Items with bin locations: ${withBinLocs.length}, without: ${withoutBinLocs.length}`);
    if (withBinLocs.length > 0) {
      console.log('Sample variance with bin locations:', withBinLocs[0]);
    }
    
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
    
    console.log(`Grouped into ${sortedBins.length} bin locations, ${noBinLocation.length} items without bin location`);
    
    // Pagination for bin locations
    const binsPerPage = itemsPerPage;
    const totalPages = Math.max(1, Math.ceil(sortedBins.length / binsPerPage));
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
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
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
        <h2 className="text-2xl font-semibold text-gray-800 mb-1">Stock Variance Summary</h2>
        <p className="text-sm text-gray-600">Review and manage stock variances</p>
      </div>
      
      {/* Recount Groups Section */}
      {variances.length > 0 && (() => {
        return (
          <div className="mb-6 bg-white rounded-sm border border-[#EDEBE9] shadow-sm">
            <button
              onClick={() => setGroupsCollapsed(!groupsCollapsed)}
              className="w-full flex items-center justify-between p-4 border-b border-[#EDEBE9] hover:bg-[#F3F2F1] transition-colors"
            >
              <h3 className="text-base font-semibold text-gray-800">Recount Groups</h3>
              <span className="text-gray-600 text-sm">
                {groupsCollapsed ? '▼' : '▲'}
              </span>
            </button>
            {!groupsCollapsed && (() => {
              const variancesWithVariance = variances.filter(v => v.variance !== 0);
              const byBinLocation = new Map();
              variancesWithVariance.forEach(v => {
                const binLocs = v.binLocations || [];
                binLocs.forEach(bin => {
                  if (!byBinLocation.has(bin)) {
                    byBinLocation.set(bin, []);
                  }
                  byBinLocation.get(bin).push(v);
                });
              });
              const sortedBins = Array.from(byBinLocation.keys()).sort();
              
              // Divide bin locations into groups (1-based indexing)
              const binsPerGroup = numberOfGroups > 0 ? Math.ceil(sortedBins.length / numberOfGroups) : sortedBins.length;
              const groups = [];
              // Create groups starting from index 1 (1-based)
              for (let i = 1; i <= numberOfGroups; i++) {
                const startIdx = (i - 1) * binsPerGroup;
                const endIdx = Math.min(startIdx + binsPerGroup, sortedBins.length);
                if (startIdx < sortedBins.length) {
                  groups[i] = sortedBins.slice(startIdx, endIdx);
                }
              }
              
              // Export CSV function
              function exportGroups() {
                const csvLines = ['Group,Bin Location,Item Code'];
                // Iterate through groups starting from 1
                for (let groupNum = 1; groupNum <= numberOfGroups; groupNum++) {
                  const group = groups[groupNum];
                  if (!group) continue;
                  group.forEach(bin => {
                    const items = byBinLocation.get(bin) || [];
                    items.forEach(item => {
                      csvLines.push(`${groupNum},"${bin}","${item.itemCode}"`);
                    });
                  });
                }
                const csv = csvLines.join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', `recount-groups-${new Date().toISOString().split('T')[0]}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
              
              // Export PDF function - generates one PDF with all groups
              function exportGroupsToPDF() {
                // Create PDF
                const pdf = new jsPDF({
                  orientation: 'portrait',
                  unit: 'mm',
                  format: 'a4'
                });
                
                const pageHeight = 280; // A4 height minus margins
                const lineHeight = 8;
                const col1X = 14; // Bin Location column start
                const col2X = 55; // Item Code column start
                const col3X = 100; // Counted column start
                const tableEndX = 200; // End of table
                let yPos = 20;
                let isFirstGroup = true;
                let headerY = 0; // Store header Y position for gridlines
                
                // Iterate through groups starting from 1
                for (let groupNum = 1; groupNum <= numberOfGroups; groupNum++) {
                  const group = groups[groupNum];
                  if (!group) continue;
                  
                  // Collect all items for this group
                  const groupItems = [];
                  group.forEach(bin => {
                    const items = byBinLocation.get(bin) || [];
                    items.forEach(item => {
                      groupItems.push({
                        binLocation: bin,
                        itemCode: item.itemCode
                      });
                    });
                  });
                  
                  // Add new page for each group (except first)
                  if (!isFirstGroup || yPos > 20) {
                    pdf.addPage();
                    yPos = 20;
                  }
                  isFirstGroup = false;
                  
                  // Group header
                  pdf.setFontSize(18);
                  pdf.setFont(undefined, 'bold');
                  pdf.text(`Recount Group ${groupNum}`, 14, yPos);
                  yPos += 12;
                  
                  pdf.setFontSize(10);
                  pdf.setFont(undefined, 'normal');
                  pdf.text(`Bin Locations: ${group.join(', ')}`, 14, yPos);
                  yPos += 6;
                  pdf.text(`Total Items: ${groupItems.length}`, 14, yPos);
                  yPos += 8;
                  
                  // Table headers
                  headerY = yPos; // Store header row Y position
                  let tableTopY = headerY - 4; // Top of table border
                  pdf.setFontSize(10);
                  pdf.setFont(undefined, 'bold');
                  pdf.text('Bin Location', col1X, yPos);
                  pdf.text('Item Code', col2X, yPos);
                  pdf.text('Counted', col3X, yPos);
                  
                  // Draw table top border
                  pdf.setLineWidth(0.5);
                  pdf.line(col1X, tableTopY, tableEndX, tableTopY);
                  
                  yPos += 6;
                  
                  // Header bottom border (separator line)
                  pdf.line(col1X, yPos - 2, tableEndX, yPos - 2);
                  
                  yPos += 4;
                  let tableBottomY = yPos; // Will be updated as rows are added
                  
                  // Table rows
                  pdf.setFont(undefined, 'normal');
                  
                  groupItems.forEach((item, idx) => {
                    // Check if we need a new page
                    if (yPos > pageHeight) {
                      // Draw vertical lines for current page before new page
                      pdf.line(col1X, tableTopY, col1X, tableBottomY - 4); // Left border
                      pdf.line(col2X, tableTopY, col2X, tableBottomY - 4); // Column separator (Item Code)
                      pdf.line(col3X, tableTopY, col3X, tableBottomY - 4); // Column separator (Counted)
                      pdf.line(tableEndX, tableTopY, tableEndX, tableBottomY - 4); // Right border
                      pdf.line(col1X, tableBottomY - 4, tableEndX, tableBottomY - 4); // Bottom border
                      
                      pdf.addPage();
                      yPos = 20;
                      headerY = yPos;
                      tableTopY = headerY - 4; // Update tableTopY for new page
                      // Re-print headers on new page
                      pdf.setFontSize(10);
                      pdf.setFont(undefined, 'bold');
                      pdf.text('Bin Location', col1X, yPos);
                      pdf.text('Item Code', col2X, yPos);
                      pdf.text('Counted', col3X, yPos);
                      
                      // Redraw gridlines for new page header
                      pdf.setLineWidth(0.5);
                      pdf.line(col1X, tableTopY, tableEndX, tableTopY); // Top border
                      yPos += 6;
                      pdf.line(col1X, yPos - 2, tableEndX, yPos - 2); // Header bottom
                      yPos += 4;
                      tableBottomY = yPos;
                      pdf.setFont(undefined, 'normal');
                    }
                    
                    pdf.text(item.binLocation || '-', col1X, yPos);
                    pdf.text(item.itemCode || '-', col2X, yPos);
                    // Leave Counted column blank for manual marking
                    
                    // Draw horizontal line after each row
                    pdf.line(col1X, yPos + 4, tableEndX, yPos + 4);
                    
                    yPos += lineHeight;
                    tableBottomY = yPos; // Update bottom position
                  });
                  
                  // Draw vertical lines for the entire table (from top to bottom)
                  pdf.line(col1X, tableTopY, col1X, tableBottomY - 4); // Left border
                  pdf.line(col2X, tableTopY, col2X, tableBottomY - 4); // Column separator (Item Code)
                  pdf.line(col3X, tableTopY, col3X, tableBottomY - 4); // Column separator (Counted)
                  pdf.line(tableEndX, tableTopY, tableEndX, tableBottomY - 4); // Right border
                  // Final bottom border of table
                  pdf.line(col1X, tableBottomY - 4, tableEndX, tableBottomY - 4);
                  
                  // Add some space after each group
                  yPos += 10;
                }
                
                // Save PDF
                pdf.save(`Recount-Groups-${new Date().toISOString().split('T')[0]}.pdf`);
              }
              
              return (
                <div className="p-6">
                  <div className="flex items-center gap-4 mb-4 flex-wrap">
                    <label className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">Number of Groups:</span>
                      <input
                        type="number"
                        min="1"
                        value={numberOfGroups}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setNumberOfGroups(val);
                          setCurrentPage(1);
                        }}
                        className="w-20 px-2 py-1.5 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4]"
                      />
                    </label>
                    <span className="text-sm text-gray-600">
                      ({sortedBins.length} bin locations found)
                    </span>
                    <div className="ml-auto flex gap-2">
                      <button
                        onClick={exportGroups}
                        className="px-4 py-2 bg-[#107C10] text-white rounded-sm hover:bg-[#0E6F0E] active:bg-[#0B5B0B] text-sm font-medium transition-colors"
                      >
                        Export CSV
                      </button>
                      <button
                        onClick={exportGroupsToPDF}
                        className="px-4 py-2 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] text-sm font-medium transition-colors"
                      >
                        Print to PDF
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-4">
                    {Array.from({ length: numberOfGroups }, (_, i) => i + 1).map((groupNum) => {
                      const group = groups[groupNum];
                      if (!group) return null;
                      
                      // Get all items for this group
                      const groupItems = [];
                      group.forEach(bin => {
                        const items = byBinLocation.get(bin) || [];
                        items.forEach(item => {
                          groupItems.push({
                            binLocation: bin,
                            itemCode: item.itemCode
                          });
                        });
                      });
                      
                      return (
                        <div key={groupNum} className="p-4 bg-[#F3F2F1] rounded-sm border border-[#EDEBE9]">
                          <div className="font-semibold text-[#0078D4] mb-3 flex items-center justify-between">
                            <span>Group {groupNum}</span>
                            <span className="text-sm text-gray-600 font-normal">
                              {group.length} bin location{group.length !== 1 ? 's' : ''}, {groupItems.length} item{groupItems.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mb-3">
                            <span className="font-medium">Bin Locations:</span> {group.join(', ')}
                          </div>
                          <div className="overflow-auto border border-[#EDEBE9] bg-white rounded-sm">
                            <table className="min-w-full text-xs">
                              <thead className="bg-[#F3F2F1] border-b border-[#EDEBE9]">
                                <tr>
                                  <th className="p-2 text-left font-semibold text-gray-800">Bin Location</th>
                                  <th className="p-2 text-left font-semibold text-gray-800">Item Code</th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupItems.map((item, idx) => (
                                  <tr key={idx} className="border-b border-[#EDEBE9] hover:bg-[#F3F2F1]">
                                    <td className="p-2 text-gray-800">{item.binLocation}</td>
                                    <td className="p-2 font-mono text-gray-800">{item.itemCode}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}
      
      {/* Upload Section */}
      <div className="mb-6 bg-white rounded-sm border border-[#EDEBE9] shadow-sm">
        <button
          onClick={() => setUploadCollapsed(!uploadCollapsed)}
          className="w-full flex items-center justify-between p-4 border-b border-[#EDEBE9] hover:bg-[#F3F2F1] transition-colors"
        >
          <h3 className="text-base font-semibold text-gray-800">Upload Files</h3>
          <span className="text-gray-600 text-sm">
            {uploadCollapsed ? '▼' : '▲'}
          </span>
        </button>
        {!uploadCollapsed && (
          <div className="p-6 grid gap-6">
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">Upload/paste Journal (Book)</h3>
                {!!rowsParsedJournal && (
                  <div className="text-xs text-gray-600 bg-[#F3F2F1] px-2 py-1 rounded-sm">Journal rows: {rowsParsedJournal}</div>
                )}
              </div>
              <input 
                type="file" 
                accept=".csv,.txt" 
                onChange={handleJournalFile} 
                className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] file:mr-4 file:py-1.5 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-medium file:bg-[#0078D4] file:text-white hover:file:bg-[#106EBE] cursor-pointer"
              />
              <textarea 
                className="min-h-[120px] px-3 py-2 border border-[#C8C6C4] bg-[#F3F2F1] text-gray-700 rounded-sm resize-none" 
                value={journalCsv} 
                readOnly
                placeholder="Journal CSV will appear here after file upload. Contents cannot be edited." 
              />
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">Upload/paste Counts</h3>
                {!!rowsParsedCounts && (
                  <div className="text-xs text-gray-600 bg-[#F3F2F1] px-2 py-1 rounded-sm">Count rows: {rowsParsedCounts}</div>
                )}
              </div>
              <input 
                type="file" 
                accept=".csv,.txt" 
                onChange={handleCountsFile} 
                className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] file:mr-4 file:py-1.5 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-medium file:bg-[#0078D4] file:text-white hover:file:bg-[#106EBE] cursor-pointer"
              />
              <textarea 
                className="min-h-[160px] px-3 py-2 border border-[#C8C6C4] bg-[#F3F2F1] text-gray-700 rounded-sm resize-none" 
                value={countsCsv} 
                readOnly
                placeholder="Counts CSV will appear here after file upload. Contents cannot be edited." 
              />
            </div>
          </div>
        )}
      </div>
      {renderVarianceOutput()}
    </div>
  );
}


