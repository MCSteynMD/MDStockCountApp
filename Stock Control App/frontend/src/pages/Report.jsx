import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { parseCountsToJson, parseJournalToJson } from '../lib/parser';
import PasswordProtect from '../components/PasswordProtect';
import jsPDF from 'jspdf';
import { processFile } from '../lib/excelUtils';
import { saveCountSummary } from '../lib/countHistory';

function ReportContent() {
  const navigate = useNavigate();
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
  const [savedCounts, setSavedCounts] = useState([]);
  const [currentCompany, setCurrentCompany] = useState('');
  const [currentWarehouse, setCurrentWarehouse] = useState('');

  // Load saved counts and current selection from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('savedCounts');
      if (saved) {
        const parsed = JSON.parse(saved);
        setSavedCounts(parsed);
      }
      
      const company = sessionStorage.getItem('company') || '';
      const warehouse = sessionStorage.getItem('warehouse') || '';
      setCurrentCompany(company);
      setCurrentWarehouse(warehouse);
      
      // Load current count data if available
      const syncedData = sessionStorage.getItem('uploadedCountsFileContent');
      if (syncedData) {
        setCountsCsv(syncedData);
        const lines = syncedData.split(/\r?\n/).filter(Boolean);
        setRowsParsedCounts(lines.length > 1 ? lines.length - 1 : 0);
      }
    } catch (error) {
      console.error('Error loading saved counts:', error);
    }
  }, []);

  // Get counts for current company/warehouse combo
  const currentCounts = useMemo(() => {
    if (!currentCompany || !currentWarehouse) return [];
    return savedCounts.filter(
      count => count.company === currentCompany && count.warehouse === currentWarehouse
    );
  }, [savedCounts, currentCompany, currentWarehouse]);

  // Get final counts for current company/warehouse combo
  const finalCounts = useMemo(() => {
    return currentCounts.filter(count => count.isFinal).sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
  }, [currentCounts]);

  // Get counts between two final counts
  const getCountsBetweenFinals = (finalIndex) => {
    if (finalIndex === 0) {
      // Get all counts before the first final
      const firstFinal = finalCounts[0];
      if (!firstFinal) return currentCounts;
      return currentCounts.filter(count => 
        new Date(count.timestamp) <= new Date(firstFinal.timestamp)
      );
    } else if (finalIndex < finalCounts.length) {
      // Get counts between this final and previous final
      const currentFinal = finalCounts[finalIndex];
      const previousFinal = finalCounts[finalIndex - 1];
      return currentCounts.filter(count => {
        const countTime = new Date(count.timestamp);
        return countTime > new Date(previousFinal.timestamp) && 
               countTime <= new Date(currentFinal.timestamp);
      });
    }
    return [];
  };

  // Build expected stock take code from selections
  function buildExpectedStockTakeCode(companyName, date, warehouse) {
    if (!companyName || !date || !warehouse) return null;
    // Format: COMPANYNAMEDATEWAREHOUSE
    // Date should be in DDMMYYYY format (8 chars)
    // Warehouse is last 4 chars
    return `${companyName}${date}${warehouse}`;
  }

  // Filter entries by company/warehouse
  function filterEntriesByCompanyWarehouse(entries, company, warehouse, date) {
    if (!company || !warehouse) return entries;
    
    const companyName = sessionStorage.getItem('selectedCompanyName') || '';
    const expectedStockTakeCode = buildExpectedStockTakeCode(companyName, date, warehouse);
    
    return entries.filter(entry => {
      const stockTakeCode = entry.raw?.stockTakeCode;
      
      // If stock take code exists, check if it matches expected pattern
      if (stockTakeCode) {
        // Check if stock take code matches expected pattern
        if (expectedStockTakeCode && stockTakeCode === expectedStockTakeCode) {
          return true;
        }
        
        // Fallback: check if it includes date and ends with warehouse
        const matchesWarehouse = stockTakeCode.endsWith(warehouse);
        const matchesDate = !date || stockTakeCode.includes(date);
        
        // Try to match company name or code in stock take code
        const matchesCompany = !companyName || 
          stockTakeCode.includes(companyName) || 
          stockTakeCode.includes(company);
        
        return matchesWarehouse && matchesDate && matchesCompany;
      }
      
      // Fallback: check raw data fields
      const matchesCompany = !entry.raw?.company || 
        entry.raw.company.toLowerCase().includes(company.toLowerCase()) ||
        (companyName && entry.raw.company.toLowerCase().includes(companyName.toLowerCase()));
      const matchesWarehouse = !entry.raw?.warehouse || 
        entry.raw.warehouse.trim() === warehouse.trim();
      const matchesDate = !date || !entry.raw?.date || 
        entry.raw.date.trim() === date.trim();
      
      return matchesCompany && matchesWarehouse && matchesDate;
    });
  }

  // Calculate variance summary for consolidated counts
  async function calculateConsolidatedVariance(countsToExport) {
    if (countsToExport.length === 0 || !journalCsv) {
      console.log('Cannot calculate variance: countsToExport.length =', countsToExport.length, 'journalCsv =', !!journalCsv);
      return null;
    }
    
    try {
      // Collect all entries from counts
      const allEntries = [];
      countsToExport.forEach(count => {
        try {
          const parsed = parseCountsToJson(count.countData);
          const filteredEntries = filterEntriesByCompanyWarehouse(
            parsed.entries, 
            currentCompany, 
            currentWarehouse, 
            count.date
          );
          allEntries.push(...filteredEntries);
          console.log(`Added ${filteredEntries.length} entries from count dated ${count.date}`);
        } catch (error) {
          console.error('Error parsing count data:', error);
        }
      });
      
      console.log(`Total entries collected: ${allEntries.length}`);
      
      if (allEntries.length === 0) {
        console.warn('No entries found after filtering');
        return null;
      }
      
      const journalParsed = parseJournalToJson(journalCsv);
      const bookEntries = journalParsed.entries || [];
      console.log(`Journal entries: ${bookEntries.length}`);
      
      if (bookEntries.length === 0) {
        console.warn('No journal entries found');
        return null;
      }
      
      const { data } = await api.post('/api/reconcile/preview', { 
        entries: allEntries, 
        bookEntries 
      });
      
      console.log(`Variance calculation returned ${(data.variances || []).length} variances`);
      return data.variances || [];
    } catch (error) {
      console.error('Error calculating variance:', error);
      alert(`Error calculating variance: ${error.response?.data?.message || error.message}`);
      return null;
    }
  }

  // Export consolidated PDF
  async function exportConsolidatedPDF(finalIndex) {
    const countsToExport = getCountsBetweenFinals(finalIndex);
    if (countsToExport.length === 0) {
      alert('No counts found to export');
      return;
    }

    // Calculate variance if journal is available
    const consolidatedVariances = await calculateConsolidatedVariance(countsToExport);
    let consolidatedVarianceSummary = null;
    
    if (consolidatedVariances && consolidatedVariances.length > 0) {
      const negativeVariance = consolidatedVariances
        .filter(v => v.variance < 0)
        .reduce((sum, v) => sum + Math.abs(v.variance), 0);
      const positiveVariance = consolidatedVariances
        .filter(v => v.variance > 0)
        .reduce((sum, v) => sum + v.variance, 0);
      const negativeVarianceValue = consolidatedVariances
        .filter(v => v.variance < 0)
        .reduce((sum, v) => sum + Math.abs(v.varianceValue || 0), 0);
      const positiveVarianceValue = consolidatedVariances
        .filter(v => v.variance > 0)
        .reduce((sum, v) => sum + (v.varianceValue || 0), 0);
      const totalStockValue = consolidatedVariances.reduce((sum, v) => {
        const bookValue = (v.book || 0) * (v.unitPrice || 0);
        return sum + bookValue;
      }, 0);
      const nettVariance = consolidatedVariances.reduce((sum, v) => sum + v.variance, 0);
      const absoluteVariance = negativeVariance + positiveVariance;
      const nettVarianceValue = consolidatedVariances.reduce((sum, v) => sum + (v.varianceValue || 0), 0);
      const absoluteVarianceValue = negativeVarianceValue + positiveVarianceValue;
      const percentageVariance = totalStockValue > 0 
        ? ((nettVarianceValue / totalStockValue) * 100) 
        : 0;
      const percentageAbsoluteVariance = totalStockValue > 0
        ? ((absoluteVarianceValue / totalStockValue) * 100)
        : 0;
      const lineVariance = consolidatedVariances.filter(v => v.variance !== 0).length;
      const linePercentageVariance = consolidatedVariances.length > 0
        ? ((lineVariance / consolidatedVariances.length) * 100)
        : 0;
      
      consolidatedVarianceSummary = {
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
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageHeight = 280;
    const lineHeight = 7;
    const tableEndX = 200;
    let yPos = 20;

    // Title
    pdf.setFontSize(16);
    pdf.setFont(undefined, 'bold');
    pdf.text('Consolidated Count Report', 14, yPos);
    yPos += 8;

    // Company/Warehouse info
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'normal');
    pdf.text(`Company: ${currentCompany}`, 14, yPos);
    yPos += 5;
    pdf.text(`Warehouse: ${currentWarehouse}`, 14, yPos);
    yPos += 5;
    
    // Add username if available
    const username = sessionStorage.getItem('username');
    if (username) {
      pdf.text(`Prepared by: ${username}`, 14, yPos);
      yPos += 5;
    }
    
    const finalCount = finalCounts[finalIndex];
    if (finalCount) {
      pdf.text(`Final Count Date: ${new Date(finalCount.timestamp).toLocaleDateString()}`, 14, yPos);
      yPos += 5;
    }
    pdf.text(`Total Counts: ${countsToExport.length}`, 14, yPos);
    yPos += 8;

    // Always show Variance Summary Reports (buttons are hidden without journal, so we should have data)
    // If for some reason we don't have summary, show error message
    if (!consolidatedVarianceSummary) {
      pdf.setFontSize(10);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(211, 52, 56); // Red
      pdf.text('Error: Could not calculate variance summaries. Please ensure Journal file is uploaded.', 14, yPos);
      yPos += 8;
    } else {
      // Show variance summary reports
      // Variance Amount Report
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(0, 120, 212); // Blue
      pdf.text('Variance Amount Report', 14, yPos);
      yPos += 6;
      
      pdf.setFontSize(9);
      pdf.setFont(undefined, 'normal');
      pdf.setTextColor(0, 0, 0);
      
      const varCol1X = 14;
      const varCol2X = 80;
      const varCol3X = 120;
      const varCol4X = 160;
      
      pdf.setFont(undefined, 'bold');
      pdf.text('Description', varCol1X, yPos);
      pdf.text('Amount', varCol2X, yPos);
      pdf.text('Total Stock Value', varCol3X, yPos);
      pdf.text('Nett Variance', varCol4X, yPos);
      yPos += 5;
      
      pdf.setLineWidth(0.3);
      pdf.line(varCol1X, yPos - 3, tableEndX, yPos - 3);
      yPos += 2;
      
      pdf.setFont(undefined, 'normal');
      // Net Variance at the top
      pdf.text('Nett Variance', varCol1X, yPos);
      pdf.text(consolidatedVarianceSummary.nettVariance.toFixed(2), varCol4X, yPos);
      yPos += 5;
      
      pdf.text('Negative Variance', varCol1X, yPos);
      pdf.text(consolidatedVarianceSummary.negativeVariance.toFixed(2), varCol2X, yPos);
      pdf.text(consolidatedVarianceSummary.totalStockValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), varCol3X, yPos);
      yPos += 5;
      
      pdf.text('Positive Variance', varCol1X, yPos);
      pdf.text(consolidatedVarianceSummary.positiveVariance.toFixed(2), varCol2X, yPos);
      yPos += 5;
      
      pdf.text('Percentage Variance', varCol1X, yPos);
      pdf.text(`${consolidatedVarianceSummary.percentageVariance.toFixed(2)}%`, varCol2X, yPos);
      yPos += 5;
      
      pdf.text('Line Variance', varCol1X, yPos);
      pdf.text(String(consolidatedVarianceSummary.lineVariance), varCol2X, yPos);
      yPos += 5;
      
      pdf.text('Line Percentage Variance', varCol1X, yPos);
      pdf.text(`${consolidatedVarianceSummary.linePercentageVariance.toFixed(2)}%`, varCol2X, yPos);
      yPos += 8;

      // Variance Value Report
      pdf.setFontSize(12);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(16, 124, 16); // Green
      pdf.text('Variance Value Report', 14, yPos);
      yPos += 6;
      
      pdf.setFontSize(9);
      pdf.setFont(undefined, 'normal');
      pdf.setTextColor(0, 0, 0);
      
      pdf.setFont(undefined, 'bold');
      pdf.text('Description', varCol1X, yPos);
      pdf.text('Amount', varCol2X, yPos);
      pdf.text('Total Stock Value', varCol3X, yPos);
      pdf.text('Nett Variance', varCol4X, yPos);
      yPos += 5;
      
      pdf.line(varCol1X, yPos - 3, tableEndX, yPos - 3);
      yPos += 2;
      
      pdf.setFont(undefined, 'normal');
      // Net Variance at the top (no currency)
      pdf.text('Nett Variance', varCol1X, yPos);
      pdf.text(consolidatedVarianceSummary.nettVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), varCol4X, yPos);
      yPos += 5;
      
      pdf.text('Negative Variance', varCol1X, yPos);
      pdf.text(consolidatedVarianceSummary.negativeVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), varCol2X, yPos);
      pdf.text(consolidatedVarianceSummary.totalStockValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), varCol3X, yPos);
      yPos += 5;
      
      pdf.text('Positive Variance', varCol1X, yPos);
      pdf.text(consolidatedVarianceSummary.positiveVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), varCol2X, yPos);
      yPos += 5;
      
      pdf.text('Percentage Variance', varCol1X, yPos);
      pdf.text(`${consolidatedVarianceSummary.percentageVariance.toFixed(2)}%`, varCol2X, yPos);
      yPos += 5;
      
      pdf.text('Line Variance', varCol1X, yPos);
      pdf.text(String(consolidatedVarianceSummary.lineVariance), varCol2X, yPos);
      yPos += 5;
      
      pdf.text('Line Percentage Variance', varCol1X, yPos);
      pdf.text(`${consolidatedVarianceSummary.linePercentageVariance.toFixed(2)}%`, varCol2X, yPos);
      yPos += 8;
    }

    // Create variance map for quick lookup
    const varianceMap = new Map();
    if (consolidatedVariances && consolidatedVariances.length > 0) {
      consolidatedVariances.forEach(v => {
        varianceMap.set(v.itemCode?.toUpperCase(), v);
      });
    }

    // Table header - define column positions
    const col1X = 14; // Item Code
    const col2X = 50; // Item Name
    const col3X = 90; // System Quantity
    const col4X = 120; // Counted
    const col5X = 150; // Variance
    const col6X = 180; // Date
    
    pdf.setFontSize(10);
    pdf.setFont(undefined, 'bold');
    pdf.text('Top 15% Variances - Item Code', col1X, yPos);
    pdf.text('Item Name', col2X, yPos);
    pdf.text('System Qty', col3X, yPos);
    pdf.text('Counted', col4X, yPos);
    pdf.text('Variance', col5X, yPos);
    pdf.text('Date', col6X, yPos);
    
    pdf.setLineWidth(0.5);
    pdf.line(col1X, yPos - 4, tableEndX, yPos - 4);
    yPos += 3;
    pdf.line(col1X, yPos, tableEndX, yPos);
    yPos += 5;

    // Collect all unique items across all counts, filtered by company/warehouse
    const itemMap = new Map();
    countsToExport.forEach(count => {
      try {
        const parsed = parseCountsToJson(count.countData);
        // Filter entries by company/warehouse before processing
        const filteredEntries = filterEntriesByCompanyWarehouse(
          parsed.entries, 
          currentCompany, 
          currentWarehouse, 
          count.date
        );
        
        filteredEntries.forEach(entry => {
          const code = entry.itemCode;
          if (!itemMap.has(code)) {
            itemMap.set(code, {
              itemCode: code,
              itemName: entry.itemName || entry.raw?.itemName || '-',
              counts: []
            });
          }
          itemMap.get(code).counts.push({
            counted: entry.counted || entry.quantity || 0,
            date: count.date || new Date(count.timestamp).toLocaleDateString()
          });
        });
      } catch (error) {
        console.error('Error parsing count data:', error);
      }
    });

    // Table rows
    pdf.setFont(undefined, 'normal');
    let items = Array.from(itemMap.values());
    
    // Filter to top 15% by variance value and variance amount
    if (items.length > 0) {
      // Calculate variance data for all items
      const itemsWithVariance = items.map(item => {
        const latestCount = item.counts[item.counts.length - 1];
        const variance = varianceMap.get(item.itemCode?.toUpperCase());
        const systemQty = variance?.book || 0;
        const counted = latestCount.counted || 0;
        const varianceAmount = variance?.variance || (counted - systemQty);
        const varianceValue = variance?.varianceValue || (varianceAmount * (variance?.unitPrice || 0));
        
        return {
          ...item,
          varianceAmount: Math.abs(varianceAmount),
          varianceValue: Math.abs(varianceValue),
          varianceAmountSigned: varianceAmount,
          varianceValueSigned: varianceValue
        };
      });
      
      // Sort by absolute variance value (descending) and get top 15%
      const sortedByValue = [...itemsWithVariance].sort((a, b) => b.varianceValue - a.varianceValue);
      const top15PercentByValue = Math.max(1, Math.ceil(itemsWithVariance.length * 0.15));
      const topByValue = sortedByValue.slice(0, top15PercentByValue).map(item => item.itemCode);
      
      // Sort by absolute variance amount (descending) and get top 15%
      const sortedByAmount = [...itemsWithVariance].sort((a, b) => b.varianceAmount - a.varianceAmount);
      const top15PercentByAmount = Math.max(1, Math.ceil(itemsWithVariance.length * 0.15));
      const topByAmount = sortedByAmount.slice(0, top15PercentByAmount).map(item => item.itemCode);
      
      // Combine both sets (union) - items that are in top 15% by value OR by amount
      const topItemsSet = new Set([...topByValue, ...topByAmount]);
      
      // Filter items to only include top 15%
      items = itemsWithVariance.filter(item => topItemsSet.has(item.itemCode));
    }
    
    items.forEach((item, idx) => {
      if (yPos > pageHeight) {
        pdf.addPage();
        yPos = 20;
        // Re-print headers
        pdf.setFontSize(10);
        pdf.setFont(undefined, 'bold');
        pdf.text('Top 15% Variances - Item Code', col1X, yPos);
        pdf.text('Item Name', col2X, yPos);
        pdf.text('System Qty', col3X, yPos);
        pdf.text('Counted', col4X, yPos);
        pdf.text('Variance', col5X, yPos);
        pdf.text('Date', col6X, yPos);
        pdf.setLineWidth(0.5);
        pdf.line(col1X, yPos - 4, tableEndX, yPos - 4);
        yPos += 3;
        pdf.line(col1X, yPos, tableEndX, yPos);
        yPos += 5;
        pdf.setFont(undefined, 'normal');
      }

      // Show the latest count for each item
      const latestCount = item.counts[item.counts.length - 1];
      const variance = varianceMap.get(item.itemCode?.toUpperCase());
      const systemQty = variance?.book || 0;
      const counted = latestCount.counted || 0;
      const varianceValue = item.varianceAmountSigned !== undefined ? item.varianceAmountSigned : (variance?.variance || (counted - systemQty));
      
      pdf.text(item.itemCode || '-', col1X, yPos);
      pdf.text((item.itemName || '-').substring(0, 20), col2X, yPos);
      pdf.text(String(systemQty), col3X, yPos);
      pdf.text(String(counted), col4X, yPos);
      pdf.text(String(varianceValue), col5X, yPos);
      pdf.text(latestCount.date || '-', col6X, yPos);
      
      pdf.line(col1X, yPos + 3, tableEndX, yPos + 3);
      yPos += lineHeight;
    });

    // Save PDF
    const filename = `Consolidated-Report-${currentCompany}-${currentWarehouse}-${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
    
    // Save count summary to historical counts
    if (consolidatedVarianceSummary) {
      const finalCount = finalCounts[finalIndex];
      const countDate = finalCount?.date 
        ? `${finalCount.date.slice(0, 2)}/${finalCount.date.slice(2, 4)}/${finalCount.date.slice(4, 8)}`
        : new Date().toLocaleDateString();
      
      await saveCountSummary({
        date: countDate,
        company: currentCompany,
        warehouse: currentWarehouse,
        person: sessionStorage.getItem('username') || 'Unknown',
        nettVariance: consolidatedVarianceSummary.nettVariance,
        nettVarianceValue: consolidatedVarianceSummary.nettVarianceValue,
        absoluteVariance: consolidatedVarianceSummary.absoluteVariance,
        totalStockValue: consolidatedVarianceSummary.totalStockValue,
      });
    }
    
    // Clear counts after export and dispatch event to update header
    const remainingCounts = savedCounts.filter(count => {
      // Keep counts that are not in the exported range
      return !countsToExport.some(exported => 
        exported.timestamp === count.timestamp &&
        exported.company === count.company &&
        exported.warehouse === count.warehouse
      );
    });
    sessionStorage.setItem('savedCounts', JSON.stringify(remainingCounts));
    setSavedCounts(remainingCounts);
    window.dispatchEvent(new Event('countsUpdated'));
    
    // Redirect to home after export
    setTimeout(() => {
      navigate('/');
    }, 500);
  }

  // Export consolidated Excel/CSV
  async function exportConsolidatedExcel(finalIndex) {
    const countsToExport = getCountsBetweenFinals(finalIndex);
    if (countsToExport.length === 0) {
      alert('No counts found to export');
      return;
    }

    // Calculate variance if journal is available
    const consolidatedVariances = await calculateConsolidatedVariance(countsToExport);
    let consolidatedVarianceSummary = null;
    
    if (consolidatedVariances && consolidatedVariances.length > 0) {
      const negativeVariance = consolidatedVariances
        .filter(v => v.variance < 0)
        .reduce((sum, v) => sum + Math.abs(v.variance), 0);
      const positiveVariance = consolidatedVariances
        .filter(v => v.variance > 0)
        .reduce((sum, v) => sum + v.variance, 0);
      const negativeVarianceValue = consolidatedVariances
        .filter(v => v.variance < 0)
        .reduce((sum, v) => sum + Math.abs(v.varianceValue || 0), 0);
      const positiveVarianceValue = consolidatedVariances
        .filter(v => v.variance > 0)
        .reduce((sum, v) => sum + (v.varianceValue || 0), 0);
      const totalStockValue = consolidatedVariances.reduce((sum, v) => {
        const bookValue = (v.book || 0) * (v.unitPrice || 0);
        return sum + bookValue;
      }, 0);
      const nettVariance = consolidatedVariances.reduce((sum, v) => sum + v.variance, 0);
      const absoluteVariance = negativeVariance + positiveVariance;
      const nettVarianceValue = consolidatedVariances.reduce((sum, v) => sum + (v.varianceValue || 0), 0);
      const absoluteVarianceValue = negativeVarianceValue + positiveVarianceValue;
      const percentageVariance = totalStockValue > 0 
        ? ((nettVarianceValue / totalStockValue) * 100) 
        : 0;
      const percentageAbsoluteVariance = totalStockValue > 0
        ? ((absoluteVarianceValue / totalStockValue) * 100)
        : 0;
      const lineVariance = consolidatedVariances.filter(v => v.variance !== 0).length;
      const linePercentageVariance = consolidatedVariances.length > 0
        ? ((lineVariance / consolidatedVariances.length) * 100)
        : 0;
      
      consolidatedVarianceSummary = {
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
    }

    const csvLines = [];
    
    // Header
    csvLines.push('Consolidated Count Report');
    csvLines.push(`Company,${currentCompany}`);
    csvLines.push(`Warehouse,${currentWarehouse}`);
    const username = sessionStorage.getItem('username');
    if (username) {
      csvLines.push(`Prepared by,${username}`);
    }
    const finalCount = finalCounts[finalIndex];
    if (finalCount) {
      csvLines.push(`Final Count Date,${new Date(finalCount.timestamp).toLocaleDateString()}`);
    }
    csvLines.push(`Total Counts,${countsToExport.length}`);
    csvLines.push('');
    
    // Variance Summary Reports if available
    if (consolidatedVarianceSummary) {
      csvLines.push('Variance Amount Report');
      csvLines.push('Description,Amount,Total Stock Value,Nett Variance,Absolute Variance');
      // Net Variance at the top
      csvLines.push(`Nett Variance,,,${consolidatedVarianceSummary.nettVariance.toFixed(2)},`);
      csvLines.push(`Negative Variance,${consolidatedVarianceSummary.negativeVariance.toFixed(2)},${consolidatedVarianceSummary.totalStockValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })},,`);
      csvLines.push(`Positive Variance,${consolidatedVarianceSummary.positiveVariance.toFixed(2)},,,${consolidatedVarianceSummary.absoluteVariance.toFixed(2)}`);
      csvLines.push(`Percentage Variance,${consolidatedVarianceSummary.percentageVariance.toFixed(2)}%,,,`);
      csvLines.push(`Percentage Absolute Variance,${consolidatedVarianceSummary.percentageAbsoluteVariance.toFixed(2)}%,,,`);
      csvLines.push(`Line Variance,${consolidatedVarianceSummary.lineVariance},,,`);
      csvLines.push(`Line Percentage Variance,${consolidatedVarianceSummary.linePercentageVariance.toFixed(2)}%,,,`);
      csvLines.push('');
      
      csvLines.push('Variance Value Report');
      csvLines.push('Description,Amount,Total Stock Value,Nett Variance,Absolute Variance');
      // Net Variance at the top (no currency)
      csvLines.push(`Nett Variance,,,${consolidatedVarianceSummary.nettVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })},`);
      csvLines.push(`Negative Variance,${consolidatedVarianceSummary.negativeVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })},${consolidatedVarianceSummary.totalStockValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })},,`);
      csvLines.push(`Positive Variance,${consolidatedVarianceSummary.positiveVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })},,,${consolidatedVarianceSummary.absoluteVarianceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      csvLines.push(`Percentage Variance,${consolidatedVarianceSummary.percentageVariance.toFixed(2)}%,,,`);
      csvLines.push(`Percentage Absolute Variance,${consolidatedVarianceSummary.percentageAbsoluteVariance.toFixed(2)}%,,,`);
      csvLines.push(`Line Variance,${consolidatedVarianceSummary.lineVariance},,,`);
      csvLines.push(`Line Percentage Variance,${consolidatedVarianceSummary.linePercentageVariance.toFixed(2)}%,,,`);
      csvLines.push('');
    }
    
    // Create variance map for quick lookup
    const varianceMap = new Map();
    if (consolidatedVariances && consolidatedVariances.length > 0) {
      consolidatedVariances.forEach(v => {
        varianceMap.set(v.itemCode?.toUpperCase(), v);
      });
    }
    
    // Line Items
    csvLines.push('Top 15% Variances - Line Items');
    csvLines.push('Item Code,Item Name,System Quantity,Counted,Variance,Date');
    
    // Collect all unique items across all counts, filtered by company/warehouse
    const itemMap = new Map();
    countsToExport.forEach(count => {
      try {
        const parsed = parseCountsToJson(count.countData);
        const filteredEntries = filterEntriesByCompanyWarehouse(
          parsed.entries, 
          currentCompany, 
          currentWarehouse, 
          count.date
        );
        
        filteredEntries.forEach(entry => {
          const code = entry.itemCode;
          if (!itemMap.has(code)) {
            itemMap.set(code, {
              itemCode: code,
              itemName: entry.itemName || entry.raw?.itemName || '-',
              counts: []
            });
          }
          itemMap.get(code).counts.push({
            counted: entry.counted || entry.quantity || 0,
            date: count.date || new Date(count.timestamp).toLocaleDateString()
          });
        });
      } catch (error) {
        console.error('Error parsing count data:', error);
      }
    });
    
    // Add items to CSV - filter to top 15%
    let items = Array.from(itemMap.values());
    
    // Filter to top 15% by variance value and variance amount
    if (items.length > 0) {
      // Calculate variance data for all items
      const itemsWithVariance = items.map(item => {
        const latestCount = item.counts[item.counts.length - 1];
        const variance = varianceMap.get(item.itemCode?.toUpperCase());
        const systemQty = variance?.book || 0;
        const counted = latestCount.counted || 0;
        const varianceAmount = variance?.variance || (counted - systemQty);
        const varianceValue = variance?.varianceValue || (varianceAmount * (variance?.unitPrice || 0));
        
        return {
          ...item,
          varianceAmount: Math.abs(varianceAmount),
          varianceValue: Math.abs(varianceValue),
          varianceAmountSigned: varianceAmount,
          varianceValueSigned: varianceValue
        };
      });
      
      // Sort by absolute variance value (descending) and get top 15%
      const sortedByValue = [...itemsWithVariance].sort((a, b) => b.varianceValue - a.varianceValue);
      const top15PercentByValue = Math.max(1, Math.ceil(itemsWithVariance.length * 0.15));
      const topByValue = sortedByValue.slice(0, top15PercentByValue).map(item => item.itemCode);
      
      // Sort by absolute variance amount (descending) and get top 15%
      const sortedByAmount = [...itemsWithVariance].sort((a, b) => b.varianceAmount - a.varianceAmount);
      const top15PercentByAmount = Math.max(1, Math.ceil(itemsWithVariance.length * 0.15));
      const topByAmount = sortedByAmount.slice(0, top15PercentByAmount).map(item => item.itemCode);
      
      // Combine both sets (union) - items that are in top 15% by value OR by amount
      const topItemsSet = new Set([...topByValue, ...topByAmount]);
      
      // Filter items to only include top 15%
      items = itemsWithVariance.filter(item => topItemsSet.has(item.itemCode));
    }
    
    items.forEach(item => {
      const latestCount = item.counts[item.counts.length - 1];
      const variance = varianceMap.get(item.itemCode?.toUpperCase());
      const systemQty = variance?.book || 0;
      const counted = latestCount.counted || 0;
      const varianceValue = item.varianceAmountSigned !== undefined ? item.varianceAmountSigned : (variance?.variance || (counted - systemQty));
      csvLines.push(`"${item.itemCode}","${item.itemName}","${systemQty}","${counted}","${varianceValue}","${latestCount.date || '-'}"`);
    });
    
    // Create and download CSV
    const csv = csvLines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Consolidated-Report-${currentCompany}-${currentWarehouse}-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Save count summary to historical counts
    if (consolidatedVarianceSummary) {
      const finalCount = finalCounts[finalIndex];
      const countDate = finalCount?.date 
        ? `${finalCount.date.slice(0, 2)}/${finalCount.date.slice(2, 4)}/${finalCount.date.slice(4, 8)}`
        : new Date().toLocaleDateString();
      
      await saveCountSummary({
        date: countDate,
        company: currentCompany,
        warehouse: currentWarehouse,
        person: sessionStorage.getItem('username') || 'Unknown',
        nettVariance: consolidatedVarianceSummary.nettVariance,
        nettVarianceValue: consolidatedVarianceSummary.nettVarianceValue,
        absoluteVariance: consolidatedVarianceSummary.absoluteVariance,
        totalStockValue: consolidatedVarianceSummary.totalStockValue,
      });
    }
    
    // Clear counts after export and dispatch event to update header
    const remainingCounts = savedCounts.filter(count => {
      // Keep counts that are not in the exported range
      return !countsToExport.some(exported => 
        exported.timestamp === count.timestamp &&
        exported.company === count.company &&
        exported.warehouse === count.warehouse
      );
    });
    sessionStorage.setItem('savedCounts', JSON.stringify(remainingCounts));
    setSavedCounts(remainingCounts);
    window.dispatchEvent(new Event('countsUpdated'));
    
    // Redirect to home after export
    setTimeout(() => {
      navigate('/');
    }, 500);
  }

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
    
    processFile(
      file,
      (csvText) => {
        setCountsCsv(csvText);
        const parsed = parseCountsToJson(csvText);
        setRowsParsedCounts(parsed.entries?.length || 0);
        // Update count display when file is loaded
        window.dispatchEvent(new Event('countsUpdated'));
      },
      (errorMessage) => {
        alert(`Error: ${errorMessage}`);
        console.error('Error processing counts file:', errorMessage);
      }
    );
  }

  function handleJournalFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    processFile(
      file,
      (csvText) => {
        setJournalCsv(csvText);
        const parsed = parseJournalToJson(csvText);
        setRowsParsedJournal(parsed.entries?.length || 0);
        // Update count display when journal is loaded for recon
        window.dispatchEvent(new Event('countsUpdated'));
      },
      (errorMessage) => {
        alert(`Error: ${errorMessage}`);
        console.error('Error processing journal file:', errorMessage);
      }
    );
  }

  async function handleRefreshExcel() {
    setRefreshingExcel(true);
    setRefreshProgress('Opening Excel...');
    
    const progressSteps = [
      { delay: 0, message: 'Opening Excel...' },
      { delay: 2000, message: 'Running macro RefreshAllData...' },
      { delay: 5000, message: 'Waiting for data refresh to complete...' },
      { delay: 10000, message: 'Reading data from worksheet...' },
    ];
    
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - (window.excelRefreshStartTime || Date.now());
      window.excelRefreshStartTime = window.excelRefreshStartTime || Date.now();
      
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
        setCountsCsv(response.data.csvContent);
        sessionStorage.setItem('uploadedCountsFileContent', response.data.csvContent);
        
        const lines = response.data.csvContent.split(/\r?\n/).filter(Boolean);
        setRowsParsedCounts(lines.length > 1 ? lines.length - 1 : 0);
        
        // Update count display when Excel data is refreshed
        window.dispatchEvent(new Event('countsUpdated'));
        
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
    
    const totalStockValue = variances.reduce((sum, v) => {
      const bookValue = (v.book || 0) * (v.unitPrice || 0);
      return sum + bookValue;
    }, 0);
    
    const nettVariance = totalDelta;
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

  // Render variance output grouped by bin location
  function renderVarianceOutput() {
    if (variances.length === 0) return null;
    
    const variancesWithVariance = variances.filter(v => v.variance !== 0);
    
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
    
    const sortedBins = Array.from(byBinLocation.keys()).sort();
    
    const binsPerPage = itemsPerPage;
    const totalPagesBins = Math.max(1, Math.ceil(sortedBins.length / binsPerPage));
    const startIdx = (currentPage - 1) * binsPerPage;
    const endIdx = startIdx + binsPerPage;
    const paginatedBins = sortedBins.slice(startIdx, endIdx);
    
    return (
      <div className="mt-6 bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_6px_12px_rgba(0,0,0,0.15),0_3px_6px_rgba(0,0,0,0.1)]">
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
                    className="px-3 py-1.5 border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 rounded-sm hover:bg-[#F3F2F1] dark:hover:bg-[#353535] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)] active:scale-[0.97]"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {totalPagesBins}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPagesBins, currentPage + 1))}
                    disabled={currentPage === totalPagesBins}
                    className="px-3 py-1.5 border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 rounded-sm hover:bg-[#F3F2F1] dark:hover:bg-[#353535] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)] active:scale-[0.97]"
                  >
                    Next
                  </button>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1.5 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] text-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all"
                  >
                    <option value={5}>5 per page</option>
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                  </select>
                </div>
              )}
            </div>
            
            {paginatedBins.map((bin, binIdx) => {
              const itemsInBin = byBinLocation.get(bin);
              const binVariance = itemsInBin.reduce((sum, v) => sum + v.variance, 0);
              const binVarianceValue = itemsInBin.reduce((sum, v) => sum + (v.varianceValue || 0), 0);
              
              return (
                <div key={binIdx} className="mb-6 bg-[#F3F2F1] rounded-sm border border-[#EDEBE9] shadow-[0_2px_4px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_4px_8px_rgba(0,0,0,0.12)]">
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
            
            {sortedBins.length > binsPerPage && (
              <div className="mt-4 text-center text-sm text-gray-600 bg-[#F3F2F1] px-3 py-2 rounded-sm">
                Showing {startIdx + 1}-{Math.min(endIdx, sortedBins.length)} of {sortedBins.length} bin locations
              </div>
            )}
            
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
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-1">Report (Journal vs Stock Counts)</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">Compare and reconcile stock counts with journal entries</p>
      </div>

      {/* Consolidated Reports Section */}
      {currentCompany && currentWarehouse && finalCounts.length > 0 && (
        <div className="bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_6px_12px_rgba(0,0,0,0.15),0_3px_6px_rgba(0,0,0,0.1)]">
          <div className="p-4 border-b border-[#EDEBE9]">
            <h3 className="text-base font-semibold text-gray-800">Consolidated Reports</h3>
            <p className="text-sm text-gray-600 mt-1">
              Export consolidated PDF/Excel reports of all counts between final counts
            </p>
            {!journalCsv && (
              <div className="text-sm text-[#D13438] bg-[#FDF6F6] px-3 py-2 rounded-sm mt-2">
                ⚠ Upload Journal (Book) file to enable export and calculate variance summaries
              </div>
            )}
          </div>
          <div className="p-6">
            <div className="grid gap-3">
              {finalCounts.map((finalCount, idx) => {
                const countsBetween = getCountsBetweenFinals(idx);
                return (
                  <div key={idx} className="flex items-center justify-between p-3 bg-[#F3F2F1] rounded-sm border border-[#EDEBE9] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)]">
                    <div>
                      <div className="font-medium text-gray-800">
                        Final Count {idx + 1} - {new Date(finalCount.timestamp).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-600">
                        {countsBetween.length} count(s) included
                      </div>
                    </div>
                    {journalCsv ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => exportConsolidatedPDF(idx)}
                          className="px-4 py-2 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] text-sm font-medium transition-all shadow-[0_2px_4px_rgba(0,120,212,0.3)] hover:shadow-[0_4px_8px_rgba(0,120,212,0.4)] active:shadow-[0_1px_2px_rgba(0,120,212,0.3)] active:scale-[0.97]"
                        >
                          Export PDF
                        </button>
                        <button
                          onClick={() => exportConsolidatedExcel(idx)}
                          className="px-4 py-2 bg-[#107C10] text-white rounded-sm hover:bg-[#0E6F0E] active:bg-[#0B5B0B] text-sm font-medium transition-all shadow-[0_2px_4px_rgba(16,124,16,0.3)] hover:shadow-[0_4px_8px_rgba(16,124,16,0.4)] active:shadow-[0_1px_2px_rgba(16,124,16,0.3)] active:scale-[0.97]"
                        >
                          Export Excel
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic">
                        Upload Journal to enable export
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      
      <div className="bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] p-6 grid gap-4 sm:max-w-4xl transition-shadow hover:shadow-[0_6px_12px_rgba(0,0,0,0.15),0_3px_6px_rgba(0,0,0,0.1)]">
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
            accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
            onChange={handleJournalFile}
                className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] file:mr-4 file:py-1.5 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-medium file:bg-[#0078D4] file:text-white hover:file:bg-[#106EBE] cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all"
          />
          {journalCsv && (
            <div className="text-sm text-[#107C10] bg-[#DFF6DD] px-3 py-2 rounded-sm">
              ✓ Journal file uploaded successfully
            </div>
          )}
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
            accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
            onChange={handleCountsFile}
                className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] file:mr-4 file:py-1.5 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-medium file:bg-[#0078D4] file:text-white hover:file:bg-[#106EBE] cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all"
          />
          {countsCsv && (
            <div className="text-sm text-[#107C10] bg-[#DFF6DD] px-3 py-2 rounded-sm">
              ✓ Stock count file uploaded successfully
            </div>
          )}
        </div>
        
        <div className="flex gap-3 pt-2">
          <button onClick={preview} className="px-4 py-2 border border-[#C8C6C4] bg-white text-gray-700 rounded-sm hover:bg-[#F3F2F1] font-medium transition-all text-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)] active:scale-[0.97]">Preview variances</button>
          <button onClick={apply} className="px-4 py-2 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] font-medium transition-all text-sm shadow-[0_2px_4px_rgba(0,120,212,0.3)] hover:shadow-[0_4px_8px_rgba(0,120,212,0.4)] active:shadow-[0_1px_2px_rgba(0,120,212,0.3)] active:scale-[0.97]">Apply adjustments</button>
        </div>
      </div>

      {/* Summary Variance Report */}
      {variances.length > 0 && (
        <div className="bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_6px_12px_rgba(0,0,0,0.15),0_3px_6px_rgba(0,0,0,0.1)]">
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
              <div className="overflow-auto border border-[#EDEBE9] rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
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
              <div className="overflow-auto border border-[#EDEBE9] rounded-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
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

export default function Report() {
  return (
    <PasswordProtect>
      <ReportContent />
    </PasswordProtect>
  );
}

