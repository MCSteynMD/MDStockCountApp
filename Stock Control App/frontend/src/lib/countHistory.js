import { api } from './api';

/**
 * Save count summary to historical counts CSV
 * @param {Object} summary - Count summary data
 * @param {string} summary.date - Date of count
 * @param {string} summary.company - Company code
 * @param {string} summary.warehouse - Warehouse code
 * @param {string} summary.person - Person who did the count
 * @param {number} summary.nettVariance - Nett variance amount
 * @param {number} summary.nettVarianceValue - Nett variance value
 * @param {number} summary.absoluteVariance - Absolute variance amount
 * @param {number} summary.totalStockValue - Total stock value
 */
export async function saveCountSummary(summary) {
  try {
    // Try to save via API first
    try {
      await api.post('/api/historical-counts', summary);
      return;
    } catch (apiError) {
      console.warn('API save failed, using localStorage fallback:', apiError);
    }

    // Fallback: Save to localStorage
    const existingData = localStorage.getItem('historicalCounts');
    const counts = existingData ? JSON.parse(existingData) : [];
    
    // Add new count summary
    counts.push({
      ...summary,
      timestamp: new Date().toISOString()
    });
    
    // Save to localStorage
    localStorage.setItem('historicalCounts', JSON.stringify(counts));
    
    // Update CSV file (for download access)
    updateCSVFile(counts);
  } catch (error) {
    console.error('Error saving count summary:', error);
  }
}

/**
 * Update CSV file content in localStorage for download access
 */
function updateCSVFile(counts) {
  const headers = ['Date', 'Company', 'Warehouse', 'Person', 'Nett Variance', 'Nett Variance Value', 'Absolute Variance', 'Total Stock Value'];
  const csvLines = [headers.join(',')];
  
  counts.forEach(count => {
    const row = [
      count.date || '',
      count.company || '',
      count.warehouse || '',
      count.person || '',
      count.nettVariance?.toFixed(2) || '0.00',
      count.nettVarianceValue?.toFixed(2) || '0.00',
      count.absoluteVariance?.toFixed(2) || '0.00',
      count.totalStockValue?.toFixed(2) || '0.00'
    ];
    csvLines.push(row.join(','));
  });
  
  const csv = csvLines.join('\n');
  // Store CSV content for download access
  localStorage.setItem('historicalCountsCSV', csv);
}

/**
 * Download historical counts CSV file
 */
export function downloadHistoricalCountsCSV() {
  const csv = localStorage.getItem('historicalCountsCSV');
  if (!csv) {
    // Generate from JSON if CSV not available
    const counts = JSON.parse(localStorage.getItem('historicalCounts') || '[]');
    updateCSVFile(counts);
    const newCsv = localStorage.getItem('historicalCountsCSV');
    if (!newCsv) return;
    
    const blob = new Blob([newCsv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'historical-counts.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', 'historical-counts.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Load historical counts
 */
export async function loadHistoricalCounts() {
  try {
    // Try API first
    try {
      const response = await api.get('/api/historical-counts');
      if (response.data && response.data.counts) {
        // Update CSV file from API data
        updateCSVFile(response.data.counts);
        return response.data.counts;
      }
    } catch (apiError) {
      console.warn('API load failed, using localStorage fallback:', apiError);
    }

    // Fallback: Load from localStorage
    const existingData = localStorage.getItem('historicalCounts');
    const counts = existingData ? JSON.parse(existingData) : [];
    
    // Ensure CSV is up to date
    if (counts.length > 0) {
      updateCSVFile(counts);
    }
    
    return counts;
  } catch (error) {
    console.error('Error loading historical counts:', error);
    return [];
  }
}

