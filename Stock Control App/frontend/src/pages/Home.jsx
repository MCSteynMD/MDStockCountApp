import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useEffect, useState } from 'react';

export default function Home() {
  const navigate = useNavigate();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [companies, setCompanies] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [dates, setDates] = useState([]);
  const [status, setStatus] = useState('');
  const [parsedOptions, setParsedOptions] = useState([]);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [uploadedFileContent, setUploadedFileContent] = useState('');

  // Mark that user has visited Home page
  useEffect(() => {
    sessionStorage.setItem('hasVisitedHome', 'true');
  }, []);

  async function loadWarehouses(companyCode) {
    if (!companyCode) {
      setWarehouses([]);
      setSelectedWarehouse('');
      return;
    }
    try {
      const response = await api.get(`/api/companies/warehouses?companyCode=${companyCode}`);
      const warehouseList = response.data.warehouses || [];
      setWarehouses(warehouseList);
      // Reset warehouse selection if current selection is not in the new list
      setSelectedWarehouse(prev => {
        if (prev && !warehouseList.includes(prev)) {
          return '';
        }
        return prev;
      });
    } catch (error) {
      console.error('Error loading warehouses:', error);
      setWarehouses([]);
    }
  }

  useEffect(() => {
    // If we have parsed options from uploaded file, use those
    if (parsedOptions.length > 0) {
      // Extract unique dates from parsed options (filtered by selected date if any)
      const filteredOptions = selectedDate 
        ? parsedOptions.filter(opt => opt.date === selectedDate)
        : parsedOptions;
      
      // Build unique dates from all parsed options
      const uniqueDates = [...new Set(parsedOptions.map(opt => opt.date))]
        .filter(date => date && date.length === 8)
        .sort()
        .reverse(); // Most recent first
      setDates(uniqueDates);
      
      // Build unique companies from filtered options
      const uniqueCompanies = [];
      const seenCompanies = new Set();
      
      filteredOptions.forEach(opt => {
        const key = opt.companyCode || opt.companyName;
        if (key && !seenCompanies.has(key)) {
          seenCompanies.add(key);
          uniqueCompanies.push({
            code: opt.companyCode || opt.companyName,
            name: opt.companyName
          });
        }
      });
      
      uniqueCompanies.sort((a, b) => a.name.localeCompare(b.name));
      setCompanies(uniqueCompanies);
      
      // If no company selected yet and we have options, auto-select first one
      if (!selectedCompany && uniqueCompanies.length > 0) {
        setSelectedCompany(uniqueCompanies[0].code);
      } else if (selectedCompany && !uniqueCompanies.find(c => c.code === selectedCompany)) {
        // Reset if current selection is not in filtered list
        setSelectedCompany('');
        setSelectedWarehouse('');
      }
      
      return;
    }
    
    // Reset dates when no file is uploaded
    setDates([]);
    
    // Otherwise load from API
    (async () => {
      try {
        const list = await api.get('/api/companies/list');
        const companiesList = list.data.companies || [];
        const companiesWithNames = list.data.companiesWithNames || [];
        
        // Store companies with names for display
        setCompanies(companiesWithNames.length > 0 ? companiesWithNames : 
          companiesList.map(code => ({ code, name: code })));
        
        // Load previously selected company and warehouse
        let storedCompany = '';
        let storedWarehouse = '';
        try {
          const storedCompanies = sessionStorage.getItem('companies');
          if (storedCompanies) {
            const parsed = JSON.parse(storedCompanies);
            if (parsed.length > 0) storedCompany = parsed[0];
          }
          storedWarehouse = sessionStorage.getItem('warehouse') || '';
        } catch {}
        
        if (!storedCompany) {
          const cur = await api.get('/api/companies/current').catch(()=>({ 
            data: { companies: [], warehouse: null } 
          }));
          storedCompany = cur.data.company || (cur.data.companies?.length > 0 ? cur.data.companies[0] : '');
          storedWarehouse = cur.data.warehouse || '';
        }
        
        // Load stored date
        try {
          const storedDate = sessionStorage.getItem('selectedDate');
          if (storedDate) {
            setSelectedDate(storedDate);
          }
        } catch {}
        
        if (storedCompany) {
          setSelectedCompany(storedCompany);
          // Load warehouses for this company
          await loadWarehouses(storedCompany);
          if (storedWarehouse) {
            setSelectedWarehouse(storedWarehouse);
          }
        }
      } catch (error) {
        console.error('Error loading companies:', error);
      }
    })();
  }, [parsedOptions, selectedDate]);

  useEffect(() => {
    if (!selectedCompany) {
      setWarehouses([]);
      return;
    }
    
    // If we have parsed options, use those to filter warehouses
    if (parsedOptions.length > 0) {
      let filtered = parsedOptions.filter(opt => (opt.companyCode || opt.companyName) === selectedCompany);
      
      // Also filter by date if selected
      if (selectedDate) {
        filtered = filtered.filter(opt => opt.date === selectedDate);
      }
      
      const companyWarehouses = filtered
        .map(opt => opt.warehouse)
        .filter((wh, index, self) => self.indexOf(wh) === index)
        .sort();
      setWarehouses(companyWarehouses);
    } else {
      // Otherwise load from API
      loadWarehouses(selectedCompany);
    }
  }, [selectedCompany, selectedDate, parsedOptions]);

  async function saveSelection() {
    if (!selectedCompany) return alert('Please select a company');
    
    await api.post('/api/companies/select', { 
      company: selectedCompany,
      warehouse: selectedWarehouse || undefined
    });
    
    try { 
      sessionStorage.setItem('companies', JSON.stringify([selectedCompany]));
      sessionStorage.setItem('company', selectedCompany);
      if (selectedWarehouse) {
        sessionStorage.setItem('warehouse', selectedWarehouse);
      }
      if (selectedDate) {
        sessionStorage.setItem('selectedDate', selectedDate);
      }
      
      // Store uploaded file content if available
      if (uploadedFileContent) {
        sessionStorage.setItem('uploadedCountsFileContent', uploadedFileContent);
      }
      
      // Store company name for filtering (find from parsed options)
      if (selectedCompany && selectedDate && selectedWarehouse && parsedOptions.length > 0) {
        const matchingOption = parsedOptions.find(opt => 
          (opt.companyCode || opt.companyName) === selectedCompany &&
          opt.date === selectedDate &&
          opt.warehouse === selectedWarehouse
        );
        if (matchingOption?.companyName) {
          sessionStorage.setItem('selectedCompanyName', matchingOption.companyName);
        }
      }
    } catch (error) {
      console.error('Error saving to sessionStorage:', error);
    }
    
    setStatus(`Company: ${selectedCompany}${selectedWarehouse ? `, Warehouse: ${selectedWarehouse}` : ''}${selectedDate ? `, Date: ${formatDate(selectedDate)}` : ''}`);
    
    // Redirect to Summary page
    navigate('/summary');
  }
  
  function formatDate(dateStr) {
    // Format DDMMYYYY to DD/MM/YYYY
    if (dateStr && dateStr.length === 8) {
      return `${dateStr.slice(0, 2)}/${dateStr.slice(2, 4)}/${dateStr.slice(4, 8)}`;
    }
    return dateStr;
  }

  async function handleStockCountFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      
      // Store the file content for later use
      setUploadedFileContent(text);
      
      setStatus('Parsing stock count file...');
      
      const response = await api.post('/api/companies/parse-stock-take-codes', { csvText: text });
      const options = response.data.options || [];
      
      if (options.length === 0) {
        setStatus('No valid stock take codes found in file');
        return;
      }
      
      setParsedOptions(options);
      setFileUploaded(true);
      
      // Extract unique dates and set first one if available
      const uniqueDates = [...new Set(options.map(opt => opt.date))]
        .filter(date => date && date.length === 8)
        .sort()
        .reverse();
      setDates(uniqueDates);
      
      // Load stored date if available
      try {
        const storedDate = sessionStorage.getItem('selectedDate');
        if (storedDate && uniqueDates.includes(storedDate)) {
          setSelectedDate(storedDate);
        } else if (uniqueDates.length > 0) {
          setSelectedDate(uniqueDates[0]); // Auto-select most recent date
        }
      } catch {}
      
      setStatus(`Found ${options.length} unique company/warehouse combinations`);
    } catch (error) {
      console.error('Error parsing stock count file:', error);
      setStatus(`Error: ${error.response?.data?.message || error.message}`);
      setUploadedFileContent(''); // Clear on error
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-800 mb-1">Welcome</h2>
        <p className="text-sm text-gray-600">Select your company and warehouse to get started</p>
      </div>

      <div className="bg-white rounded-sm border border-[#EDEBE9] shadow-sm p-6 grid gap-4 sm:max-w-2xl">
        <div className="border-b border-[#EDEBE9] pb-4 mb-4">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Company and Warehouse Selection</h3>
        </div>
        
        {/* File upload for stock count */}
        <div className="grid gap-2">
          <label className="text-sm font-medium text-gray-700">
            Upload Stock Count File <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="file"
            accept=".csv,.txt"
            onChange={handleStockCountFile}
            className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] file:mr-4 file:py-1.5 file:px-4 file:rounded-sm file:border-0 file:text-sm file:font-medium file:bg-[#0078D4] file:text-white hover:file:bg-[#106EBE] cursor-pointer"
          />
          {fileUploaded && (
            <div className="text-xs text-[#107C10] bg-[#DFF6DD] px-2 py-1.5 rounded-sm mt-1">
              ✓ File loaded - dropdowns populated from stock take codes
            </div>
          )}
        </div>
        
        {/* Date picker - only shown when file is uploaded */}
        {dates.length > 0 && (
          <div className="grid gap-2">
            <label className="text-sm font-medium text-gray-700">Date</label>
            <select
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedCompany('');
                setSelectedWarehouse('');
              }}
              className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4]"
            >
              <option value="">-- All Dates --</option>
              {dates.map(date => (
                <option key={date} value={date}>
                  {formatDate(date)}
                </option>
              ))}
            </select>
          </div>
        )}
        
        {/* Company dropdown */}
        <div className="grid gap-2">
          <label className="text-sm font-medium text-gray-700">Company</label>
          <select
            value={selectedCompany}
            onChange={(e) => {
              setSelectedCompany(e.target.value);
              setSelectedWarehouse('');
            }}
            className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4]"
          >
            <option value="">-- Select Company --</option>
            {companies.map(comp => (
              <option key={comp.code} value={comp.code}>
                {comp.code} - {comp.name}
              </option>
            ))}
          </select>
        </div>

        {/* Warehouse dropdown */}
        {selectedCompany && (
          <div className="grid gap-2">
            <label className="text-sm font-medium text-gray-700">Warehouse</label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] disabled:bg-[#F3F2F1] disabled:text-gray-500 disabled:cursor-not-allowed"
              disabled={!selectedCompany || warehouses.length === 0}
            >
              <option value="">-- Select Warehouse --</option>
              {warehouses.map(wh => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>
            {warehouses.length === 0 && selectedCompany && (
              <div className="text-xs text-gray-500 bg-[#FFF4CE] px-2 py-1.5 rounded-sm mt-1">No warehouses found for this company</div>
            )}
          </div>
        )}

        <div className="flex gap-3 items-center pt-2">
          <button 
            onClick={saveSelection} 
            className="px-4 py-2 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            disabled={!selectedCompany}
          >
            Save
          </button>
          {status && (
            <span className="ml-2 text-sm text-gray-600 bg-[#E1DFDD] px-3 py-1.5 rounded-sm">
              {status}
            </span>
          )}
        </div>
        
        {selectedCompany && (
          <div className="text-sm text-gray-600 bg-[#F3F2F1] px-3 py-2 rounded-sm">
            <span className="font-medium">Selected:</span> {selectedCompany}{selectedWarehouse ? ` - ${selectedWarehouse}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}



