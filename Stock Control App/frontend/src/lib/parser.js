// Parse SharePoint-like export (CSV/TSV or pasted from Excel) into a JSON payload
// Returns: { meta: { company, stockTakeCode, date, warehouse }, entries: [{ itemCode, counted, raw }] }
// - Detects delimiter automatically (tab > comma > semicolon > pipe)
// - Header names matched case-insensitively
// - Quantity: prefers 'Quantity'; otherwise sums Count, Count2, Count3, Count4 columns if present
export function parseCountsToJson(text) {
  const content = (text || '').trim();
  if (!content) return { meta: {}, entries: [] };

  const delimiter = detectDelimiter(content);
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { meta: {}, entries: [] };

  const headers = splitLine(lines[0], delimiter).map(h => h.trim());
  const idx = indexer(headers);
  
  // Debug: log headers to help diagnose bin location detection
  console.log('Count file headers:', headers);
  console.log('Normalized headers map:', Array.from(idx.entries()).slice(0, 10));

  const entries = [];
  let meta = { company: undefined, stockTakeCode: undefined, date: undefined, warehouse: undefined };

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delimiter);
    if (cols.length === 1 && !cols[0]) continue;

    const barcode = pick(cols, idx, ['barcode', 'bar code', 'item code', 'item number', 'code', 'sku']);
    const itemName = pick(cols, idx, ['product name', 'productname', 'item name', 'description', 'item', 'name', 'product']);
    const company = pick(cols, idx, ['company']);
    const stockTakeCode = pick(cols, idx, ['stock take code', 'stocktake code', 'take code']);
    const date = pick(cols, idx, ['date']);
    const warehouse = pick(cols, idx, ['warehouse', 'warehous', 'wh']);
    const binLocation = pick(cols, idx, ['bin location', 'binlocation', 'bin', 'location']);
    
    // Debug: log bin location detection summary
    if (i === 2) {
      console.log(`First bin location found: "${binLocation}"`);
    }
    if (i === 100) {
      console.log(`At row 100, bin location: "${binLocation || '(empty)'}"`);
    }

    if (!meta.company && company) meta.company = company;
    if (!meta.stockTakeCode && stockTakeCode) meta.stockTakeCode = stockTakeCode;
    if (!meta.date && date) meta.date = date;
    if (!meta.warehouse && warehouse) meta.warehouse = warehouse;

    const barcodeStr = String(barcode || '').trim();
    // Use barcode as item identifier
    if (!barcodeStr) continue;
    
    const quantity = getQuantity(cols, idx);
    if (quantity === 0 && !hasAnyCountValue(cols, idx)) continue; // Skip if no count values at all

    // Extract count values from different count columns to pass to backend
    // These will be used to determine which count column (highest number) to use per item
    const count2 = pick(cols, idx, ['Count 2', 'Count2', 'count 2', 'count2']);
    const count3 = pick(cols, idx, ['Count 3', 'Count3', 'count 3', 'count3']);
    const count4 = pick(cols, idx, ['Count 4', 'Count4', 'count 4', 'count4']);
    const count5 = pick(cols, idx, ['Count 5', 'Count5', 'count 5', 'count5']);
    const quantityCol = pick(cols, idx, ['Quantity', 'quantity']);
    
    // Ensure binLocation is a valid string (not empty, not just whitespace)
    const validBinLocation = binLocation && String(binLocation).trim() !== '' ? String(binLocation).trim() : undefined;
    
    entries.push({
      itemCode: barcodeStr, // Use barcode as item identifier
      counted: quantity, // Still include for backwards compatibility
      itemName: itemName || undefined,
      raw: {
        barcode: barcodeStr,
        itemName,
        company,
        stockTakeCode,
        date,
        warehouse,
        binLocation: validBinLocation, // Use validated bin location
        count2: count2 || undefined,
        count3: count3 || undefined,
        count4: count4 || undefined,
        count5: count5 || undefined,
        quantity: quantityCol || undefined,
      }
    });
    
    // Debug: log bin location extraction summary
    if (i === entries.length && entries.length <= 5) {
      console.log(`Entry ${entries.length}: itemCode=${barcodeStr}, binLocation=${binLocation || '(empty)'}`);
    }
  }

  // If no entries detected using headers, try a loose parser for headerless delimited rows (e.g. ;;CODE;QTY;NAME)
  if (entries.length === 0) {
    const loose = parseLooseCounts(content, delimiter);
    return { meta, entries: loose };
  }

  return { meta, entries };
}

// Parse a journal export (CSV/TSV/Excel paste) that represents "book" or on-hand quantities
// Returns: { entries: [{ itemCode, book, costPrice }] }
export function parseJournalToJson(text) {
  const content = (text || '').trim();
  if (!content) return { entries: [] };

  const delimiter = detectDelimiter(content);
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { entries: [] };

  const headers = splitLine(lines[0], delimiter).map(h => {
    // Remove quotes and trim
    const trimmed = h.trim().replace(/^"|"$/g, '');
    return trimmed;
  });
  
  // Debug: log headers to help diagnose
  console.log('Journal headers detected:', headers);
  console.log('Normalized headers:', headers.map(h => normalize(h)));
  
  const idx = indexer(headers);
  
  // Debug: log what we're looking for
  const costPriceVariations = [
    'cost price', 'costprice', 'cost', 'unit price', 'unitprice', 'price', 'unit cost', 'unitcost', 'cp',
    'cost_price', 'costprice', 'cost_amount', 'unit_cost', 'unitcost', 'purchase price', 'purchaseprice',
    'standard cost', 'standardcost', 'avg cost', 'avgcost', 'average cost', 'averagecost'
  ];
  console.log('Looking for cost price columns with variations:', costPriceVariations);
  console.log('Normalized variations:', costPriceVariations.map(v => normalize(v)));
  
  // Check if any header matches
  headers.forEach((header, i) => {
    const normalized = normalize(header);
    costPriceVariations.forEach(variation => {
      if (normalized === normalize(variation)) {
        console.log(`✓ MATCH FOUND: Column "${header}" (index ${i}, normalized: "${normalized}") matches "${variation}"`);
      }
    });
  });

  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i], delimiter);
    if (cols.length === 1 && !cols[0]) continue;
    
    // Remove quotes from each column
    const cleanedCols = cols.map(c => {
      const trimmed = c.trim();
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        return trimmed.slice(1, -1).replace(/""/g, '"');
      }
      return trimmed;
    });
    
    const barcode = pick(cleanedCols, idx, ['barcode', 'bar code', 'item code', 'item number', 'code', 'sku']);
    const itemName = pick(cleanedCols, idx, ['product name', 'productname', 'item name', 'description', 'item', 'name', 'product']);
    const onHand = pick(cleanedCols, idx, [
      'AX Quantity', 'ax quantity', 'axquantity', 'book', 'on hand', 'onhand', 'qty on hand', 'quantity on hand', 'qtyonhand', 'qoh', 'quantity', 'balance'
    ]);
    const costPrice = pick(cleanedCols, idx, [
      'Cost Price', 'cost price', 'costprice', 'cost', 'unit price', 'unitprice', 'price', 'unit cost', 'unitcost', 'cp',
      'cost_price', 'costprice', 'cost_amount', 'unit_cost', 'unitcost', 'purchase price', 'purchaseprice',
      'standard cost', 'standardcost', 'avg cost', 'avgcost', 'average cost', 'averagecost'
    ]);
    
    // Debug: log if we found cost price
    if (costPrice && costPrice !== '') {
      console.log(`Found cost price for ${barcode}: ${costPrice}`);
    }
    
    const book = toNum(onHand);
    const price = toNum(costPrice);
    if (!barcode && !book) continue;
    entries.push({ 
      itemCode: String(barcode || '').trim(), 
      book, 
      costPrice: price,
      itemName: itemName || undefined, 
      raw: { itemName, costPrice: costPrice } 
    });
  }

  if (entries.length === 0) {
    const loose = parseLooseJournal(content, delimiter);
    return { entries: loose };
  }

  // Debug: log sample entry to verify costPrice is included
  if (entries.length > 0) {
    console.log('Sample journal entry:', entries[0]);
  }

  return { entries };
}

// Headerless journal parser: ";;code;book;name;..."
function parseLooseJournal(text, preferredDelimiter) {
  const delimiter = preferredDelimiter || detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    let cols = splitLine(line, delimiter).map(c => String(c || '').trim());     
    while (cols.length && cols[0] === '') cols.shift();
    if (cols.length === 0) continue;

    const code = cols[0];
    const num = toNum(cols[1]);
    const book = Number.isFinite(num) ? num : 0;
    // Try to find cost price - could be in cols[2], cols[3], or later columns
    const costPrice = cols.length >= 3 ? toNum(cols[2]) : (cols.length >= 4 ? toNum(cols[3]) : 0);
    const name = cols.length >= 4 ? cols.slice(3).filter(Boolean).join(' ') : (cols.length >= 3 ? cols.slice(2).filter(Boolean).join(' ') : '');                                                                               
    if (!code) continue;
    entries.push({ itemCode: code, book, costPrice, itemName: name || undefined, raw: { itemName: name, costPrice } });                                                               
  }
  return entries;
}

function detectDelimiter(text) {
  const sample = (text || '').split(/\r?\n/).slice(0, 10).join('\n');
  const candidates = ['\t', ';', ',', '|'];
  const counts = candidates.map(d => ({ d, c: (sample.match(new RegExp(escapeRegex(d), 'g')) || []).length }));
  counts.sort((a,b)=> b.c - a.c);
  return counts[0].c > 0 ? counts[0].d : ',';
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitLine(line, delimiter) {
  // Handle quoted CSV fields (especially important for comma-delimited files)
  // If delimiter is comma, use proper CSV parsing to handle quotes
  if (delimiter === ',') {
    return parseQuotedCSVLine(line);
  }
  // For other delimiters (tab, semicolon, pipe), try to handle quoted fields too
  // but fall back to simple split if no quotes present
  if (line.includes('"')) {
    return parseQuotedDelimitedLine(line, delimiter);
  }
  // Simple split for unquoted lines
  return line.split(delimiter);
}

// Parse a CSV line handling quoted fields with commas inside
// Handles: "Name, Inc.", 123, "Description, with commas"
function parseQuotedCSVLine(line) {
  const fields = [];
  let current = '';
  let insideQuotes = false;
  let fieldStartedWithQuote = false;
  
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
        if (!insideQuotes) fieldStartedWithQuote = true;
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // Field separator outside quotes
      // Remove surrounding quotes if field started with quote
      let finalValue = current;
      if (fieldStartedWithQuote && finalValue.startsWith('"') && finalValue.endsWith('"')) {
        finalValue = finalValue.slice(1, -1).replace(/""/g, '"');
      }
      fields.push(finalValue);
      current = '';
      fieldStartedWithQuote = false;
    } else {
      current += char;
    }
  }
  
  // Add the last field - remove surrounding quotes if needed
  let finalValue = current;
  if (fieldStartedWithQuote && finalValue.startsWith('"') && finalValue.endsWith('"')) {
    finalValue = finalValue.slice(1, -1).replace(/""/g, '"');
  }
  fields.push(finalValue);
  return fields;
}

// Parse delimited line with quoted fields (for tab, semicolon, pipe)
function parseQuotedDelimitedLine(line, delimiter) {
  const fields = [];
  let current = '';
  let insideQuotes = false;
  let fieldStartedWithQuote = false;
  
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
        if (!insideQuotes) fieldStartedWithQuote = true;
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      // Field separator outside quotes
      // Remove surrounding quotes if field started with quote
      let finalValue = current;
      if (fieldStartedWithQuote && finalValue.startsWith('"') && finalValue.endsWith('"')) {
        finalValue = finalValue.slice(1, -1).replace(/""/g, '"');
      }
      fields.push(finalValue);
      current = '';
      fieldStartedWithQuote = false;
    } else {
      current += char;
    }
  }
  
  // Add the last field - remove surrounding quotes if needed
  let finalValue = current;
  if (fieldStartedWithQuote && finalValue.startsWith('"') && finalValue.endsWith('"')) {
    finalValue = finalValue.slice(1, -1).replace(/""/g, '"');
  }
  fields.push(finalValue);
  return fields;
}

function indexer(headers) {
  const map = new Map();
  headers.forEach((h, i) => {
    map.set(normalize(h), i);
  });
  return map;
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function pick(cols, idx, names) {
  for (const n of names) {
    const i = idx.get(normalize(n));
    if (i != null && i < cols.length) {
      const v = cols[i];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
  }
  // try direct header match when names already normalized
  for (const [key, i] of idx.entries()) {
    if (names.map(normalize).includes(key)) {
      const v = cols[i];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
  }
  return '';
}

function toNum(x) {
  const n = Number(String(x || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// Helper to check if a value exists and is not empty/zero
function hasValue(val) {
  if (val === undefined || val === null || val === '') return false;
  const str = String(val).trim();
  if (str === '' || str === '-' || str.toLowerCase() === 'n/a') return false;
  return true;
}

// Helper to check if a value looks like a quantity (reasonable stock quantity, not a timestamp/ID)
function isValidQuantity(val) {
  if (!hasValue(val)) return false;
  const str = String(val).trim();
  const num = toNum(str);
  // Reject if it looks like a timestamp (10+ digits, or decimal with large integer part)
  if (str.match(/^\d{10,}$/)) return false; // 10+ digit number (likely timestamp/ID)
  if (num > 1000000) return false; // Unreasonably large quantity
  // Reject if it's just digits but very long (likely scan ID)
  if (str.match(/^\d{8,}$/) && num > 10000) return false;
  return true;
}

// Helper to check if any count column has a valid value
function hasAnyCountValue(cols, idx) {
  // Check all count columns
  const count5Idx = idx.get(normalize('Count 5')) ?? idx.get(normalize('Count5'));
  if (count5Idx != null && count5Idx < cols.length && isValidQuantity(cols[count5Idx])) return true;
  
  const count4Idx = idx.get(normalize('Count 4')) ?? idx.get(normalize('Count4'));
  if (count4Idx != null && count4Idx < cols.length && isValidQuantity(cols[count4Idx])) return true;
  
  const count3Idx = idx.get(normalize('Count 3')) ?? idx.get(normalize('Count3'));
  if (count3Idx != null && count3Idx < cols.length && isValidQuantity(cols[count3Idx])) return true;
  
  const count2Idx = idx.get(normalize('Count 2')) ?? idx.get(normalize('Count2'));
  if (count2Idx != null && count2Idx < cols.length && isValidQuantity(cols[count2Idx])) return true;
  
  const countQuantityIdx = idx.get(normalize('Count Quantity'));
  if (countQuantityIdx != null && countQuantityIdx < cols.length && hasValue(cols[countQuantityIdx])) return true;
  
  const quantityIdx = idx.get(normalize('Quantity'));
  if (quantityIdx != null && quantityIdx < cols.length && hasValue(cols[quantityIdx])) return true;
  
  return false;
}

function getQuantity(cols, idx) {
  // Match spreadsheet priority: Count 5 > Count 4 > Count 3 > Count 2 > Count Quantity > Quantity
  // Use the most recent count available (Count 5 is most recent, then Count 4, etc.)
  // Excel formula: IF(Count5<>""&<>0, Count5, IF(Count4, Count4, IF(Count3, Count3, IF(CountQty, CountQty, Quantity))))
  
  // 1. Try Count 5 (highest priority - most recent recount)
  const count5Idx = idx.get(normalize('Count 5')) ?? idx.get(normalize('Count5'));
  if (count5Idx != null && count5Idx < cols.length) {
    const val = cols[count5Idx];
    if (isValidQuantity(val)) {
      const num = toNum(val);
      if (num !== 0) return num;
      if (val === '0' || val === 0) return 0;
    }
  }
  
  // 2. Try Count 4
  const count4Idx = idx.get(normalize('Count 4')) ?? idx.get(normalize('Count4'));
  if (count4Idx != null && count4Idx < cols.length) {
    const val = cols[count4Idx];
    if (isValidQuantity(val)) {
      const num = toNum(val);
      if (num !== 0) return num;
      if (val === '0' || val === 0) return 0;
    }
  }
  
  // 3. Try Count 3
  const count3Idx = idx.get(normalize('Count 3')) ?? idx.get(normalize('Count3'));
  if (count3Idx != null && count3Idx < cols.length) {
    const val = cols[count3Idx];
    if (isValidQuantity(val)) {
      const num = toNum(val);
      if (num !== 0) return num;
      if (val === '0' || val === 0) return 0;
    }
  }
  
  // 4. Try Count 2 (first recount)
  const count2Idx = idx.get(normalize('Count 2')) ?? idx.get(normalize('Count2'));
  if (count2Idx != null && count2Idx < cols.length) {
    const val = cols[count2Idx];
    if (isValidQuantity(val)) {
      const num = toNum(val);
      if (num !== 0) return num;
      if (val === '0' || val === 0) return 0;
    }
  }
  
  // 5. Try Count Quantity (main/initial count)
  const countQuantityIdx = idx.get(normalize('Count Quantity'));
  if (countQuantityIdx != null && countQuantityIdx < cols.length) {
    const val = cols[countQuantityIdx];
    if (hasValue(val)) {
      const num = toNum(val);
      if (num !== 0) return num;
      if (val === '0' || val === 0) return 0;
    }
  }
  
  // 6. Try Counted
  const countedIdx = idx.get(normalize('Counted'));
  if (countedIdx != null && countedIdx < cols.length) {
    const val = cols[countedIdx];
    if (hasValue(val)) {
      const num = toNum(val);
      if (num !== 0) return num;
      if (val === '0' || val === 0) return 0;
    }
  }
  
  // 7. Try Quantity
  const qIdx = idx.get(normalize('Quantity'));
  if (qIdx != null && qIdx < cols.length) {
    const val = cols[qIdx];
    if (hasValue(val)) {
      const num = toNum(val);
      if (num !== 0) return num;
      if (val === '0' || val === 0) return 0;
    }
  }

  // 8. Otherwise sum all Count columns as fallback (Count, Count1, Count2, Count3, Count4, Count5...)
  let total = 0;
  let found = false;
  for (const [key, i] of idx.entries()) {
    if (/^count\d*$/.test(key) || key === 'count') {
      const val = cols[i];
      if (hasValue(val)) {
        const num = toNum(val);
        total += num;
        found = true;
      }
    }
  }
  return found ? total : 0;
}

// Heuristic parser for headerless delimited rows such as
// ";;1010100090;2;BRAZING ROD" or "1010100090;2;BRAZING ROD"
function parseLooseCounts(text, preferredDelimiter) {
  const delimiter = preferredDelimiter || detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    let cols = splitLine(line, delimiter).map(c => String(c || '').trim());
    // Drop leading empty tokens like ['', ''] from ';;code;qty;name'
    while (cols.length && cols[0] === '') cols.shift();
    if (cols.length === 0) continue;

    const code = cols[0];
    // Find first numeric token after code as quantity
    let qty = 0;
    let name = '';
    if (cols.length >= 2) {
      const num = toNum(cols[1]);
      qty = Number.isFinite(num) ? num : 0;
    }
    if (cols.length >= 3) {
      name = cols.slice(2).filter(Boolean).join(' ');
    }

    if (!code) continue;
    entries.push({ itemCode: code, counted: qty, itemName: name || undefined, raw: { itemName: name } });
  }
  return entries;
}


