import * as XLSX from 'xlsx';

/**
 * Converts an Excel file to CSV text format
 * @param {File} file - The Excel file to convert
 * @returns {Promise<string>} - CSV text content
 */
export async function excelToCsv(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get the first worksheet (or active sheet)
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to CSV
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        resolve(csv);
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Checks if a file is an Excel file
 * @param {File} file - The file to check
 * @returns {boolean}
 */
export function isExcelFile(file) {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
}

/**
 * Checks if a file is a CSV/text file
 * @param {File} file - The file to check
 * @returns {boolean}
 */
export function isCsvFile(file) {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.csv') || fileName.endsWith('.txt');
}

/**
 * Handles file upload - supports both Excel and CSV files
 * @param {File} file - The file to process
 * @param {Function} onSuccess - Callback with CSV text content
 * @param {Function} onError - Callback with error message
 */
export async function processFile(file, onSuccess, onError) {
  try {
    if (isExcelFile(file)) {
      const csv = await excelToCsv(file);
      onSuccess(csv);
    } else if (isCsvFile(file)) {
      const text = await file.text();
      onSuccess(text);
    } else {
      onError('Please upload a CSV or Excel file (.csv, .txt, .xlsx, .xls)');
    }
  } catch (error) {
    onError(error.message || 'Failed to process file');
  }
}

