import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useEffect, useState } from 'react';
import { processFile } from '../lib/excelUtils';
import { getFutureCounts, getFutureCountsForDate } from '../lib/futureCounts';

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
  const [refreshingExcel, setRefreshingExcel] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState('');
  const [isFinalCount, setIsFinalCount] = useState(false);
  const [finalCountsCollapsed, setFinalCountsCollapsed] = useState(true);
  const [finalCounts, setFinalCounts] = useState([]);
  const [futureCounts, setFutureCounts] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);

  // Mark that user has visited Home page
  useEffect(() => {
    sessionStorage.setItem('hasVisitedHome', 'true');
  }, []);

  // Load future counts
  useEffect(() => {
    const loadFutureCounts = () => {
      const counts = getFutureCounts();
      setFutureCounts(counts);
    };
    
    loadFutureCounts();
    
    // Listen for updates
    const handleUpdate = () => {
      loadFutureCounts();
    };
    
    window.addEventListener('futureCountsUpdated', handleUpdate);
    return () => window.removeEventListener('futureCountsUpdated', handleUpdate);
  }, []);

  // Load final counts from sessionStorage
  useEffect(() => {
    const updateFinalCounts = () => {
      try {
        const savedCountsStr = sessionStorage.getItem('savedCounts');
        if (savedCountsStr) {
          const savedCounts = JSON.parse(savedCountsStr);
          // Filter only final counts and sort by date (newest first)
          const finals = savedCounts
            .filter(count => count.isFinal)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          setFinalCounts(finals);
        } else {
          setFinalCounts([]);
        }
      } catch (error) {
        console.error('Error loading final counts:', error);
        setFinalCounts([]);
      }
    };

    updateFinalCounts();
    
    // Listen for updates
    const handleCountsUpdate = () => {
      updateFinalCounts();
    };
    
    window.addEventListener('countsUpdated', handleCountsUpdate);
    
    return () => {
      window.removeEventListener('countsUpdated', handleCountsUpdate);
    };
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
    
    // Clear selections when no file is uploaded
    if (!fileUploaded) {
      setSelectedCompany('');
      setSelectedWarehouse('');
      setSelectedDate('');
    }
    
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
    if (!selectedDate) return alert('Please select a date');
    if (!selectedWarehouse) return alert('Please select a warehouse');
    
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
        
        // Save count to savedCounts array
        const savedCountsStr = sessionStorage.getItem('savedCounts');
        const savedCounts = savedCountsStr ? JSON.parse(savedCountsStr) : [];
        
        const newCount = {
          company: selectedCompany,
          warehouse: selectedWarehouse || '',
          date: selectedDate || '',
          isFinal: isFinalCount,
          countData: uploadedFileContent,
          timestamp: new Date().toISOString()
        };
        
        savedCounts.push(newCount);
        // Keep only last 6 counts (as per requirement)
        const trimmedCounts = savedCounts.slice(-6);
        sessionStorage.setItem('savedCounts', JSON.stringify(trimmedCounts));
        
        // Dispatch event to update count display in header
        window.dispatchEvent(new Event('countsUpdated'));
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
    
    // Redirect based on final count flag
    if (isFinalCount) {
      navigate('/report');
    } else {
      navigate('/summary');
    }
  }
  
  function formatDate(dateStr) {
    // Format DDMMYYYY to DD/MM/YYYY
    if (dateStr && dateStr.length === 8) {
      return `${dateStr.slice(0, 2)}/${dateStr.slice(2, 4)}/${dateStr.slice(4, 8)}`;
    }
    return dateStr;
  }

  async function processCsvContent(csvText) {
    try {
      // Store the file content for later use
      setUploadedFileContent(csvText);
      
      setStatus('Parsing stock count file...');
      
      const response = await api.post('/api/companies/parse-stock-take-codes', { csvText });
      const options = response.data.options || [];
      
      if (options.length === 0) {
        setStatus('No valid stock take codes found in file');
        setParsedOptions([]);
        setFileUploaded(false);
        return;
      }
      
      // Extract unique dates from ALL options before filtering
      const uniqueDates = [...new Set(options.map(opt => opt.date))]
        .filter(date => date && date.length === 8)
        .sort()
        .reverse();
      
      // Check if current selectedDate exists in new data
      const currentDate = selectedDate;
      const dateExistsInNewData = currentDate && uniqueDates.includes(currentDate);
      
      // Set dates first
      setDates(uniqueDates);
      
      // Update selectedDate: keep current if it exists in new data, otherwise use most recent
      let newSelectedDate = selectedDate;
      if (dateExistsInNewData) {
        // Keep current date - don't change it
        // This preserves user's selection if it's still valid
        newSelectedDate = selectedDate;
      } else if (uniqueDates.length > 0) {
        // Current date not in new data, reset to most recent
        newSelectedDate = uniqueDates[0];
        setSelectedDate(uniqueDates[0]);
      } else {
        // No dates available, clear selection
        newSelectedDate = '';
        setSelectedDate('');
      }
      
      // Now set parsed options - this will trigger useEffect to update dropdowns
      setParsedOptions(options);
      setFileUploaded(true);
      
      // Reset company/warehouse if they're no longer valid after refresh
      // This will be handled by the useEffect, but we can also clear them here if needed
      if (newSelectedDate && selectedCompany) {
        // Check if current company/warehouse combo is still valid
        const filteredByDate = newSelectedDate 
          ? options.filter(opt => opt.date === newSelectedDate)
          : options;
        const companyStillValid = filteredByDate.some(opt => 
          (opt.companyCode || opt.companyName) === selectedCompany
        );
        if (!companyStillValid) {
          setSelectedCompany('');
          setSelectedWarehouse('');
        }
      }
      
      setStatus(`Found ${options.length} unique company/warehouse combinations`);
    } catch (error) {
      console.error('Error parsing stock count file:', error);
      setStatus(`Error: ${error.response?.data?.message || error.message}`);
      setUploadedFileContent(''); // Clear on error
      setParsedOptions([]);
      setFileUploaded(false);
    }
  }

  async function handleStockCountFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    await processFile(
      file,
      async (csvText) => {
        await processCsvContent(csvText);
        // Update count display when file is loaded
        window.dispatchEvent(new Event('countsUpdated'));
      },
      (errorMessage) => {
        setStatus(`Error: ${errorMessage}`);
        console.error('Error processing file:', errorMessage);
      }
    );
  }

  async function handleRefreshExcel() {
    setRefreshingExcel(true);
    setRefreshProgress('Opening Excel...');
    setStatus('Starting Excel refresh...');
    
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
        setStatus('Excel refreshed successfully! Processing data...');
        await processCsvContent(response.data.csvContent);
        setRefreshProgress('');
        // Status will be updated by processCsvContent
      } else {
        setRefreshProgress('');
        setStatus(`Error: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Error refreshing Excel:', error);
      setRefreshProgress('');
      setStatus(`Error: ${error.response?.data?.message || error.message || 'Failed to refresh Excel'}`);
    } finally {
      setRefreshingExcel(false);
      window.excelRefreshStartTime = null;
    }
  }

  // Calendar helper functions
  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const days = [];
    const today = new Date();
    const isCurrentMonth = currentMonth === today.getMonth() && currentYear === today.getFullYear();
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateStr = date.toISOString().split('T')[0];
      const countsForDay = getFutureCountsForDate(dateStr);
      const isToday = isCurrentMonth && day === today.getDate();
      const isPast = date < new Date() && !isToday;
      
      days.push({
        day,
        date,
        dateStr,
        countsForDay,
        isToday,
        isPast
      });
    }
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    const navigateMonth = (direction) => {
      if (direction === 'prev') {
        if (currentMonth === 0) {
          setCurrentMonth(11);
          setCurrentYear(currentYear - 1);
        } else {
          setCurrentMonth(currentMonth - 1);
        }
      } else {
        if (currentMonth === 11) {
          setCurrentMonth(0);
          setCurrentYear(currentYear + 1);
        } else {
          setCurrentMonth(currentMonth + 1);
        }
      }
    };
    
    return (
      <div className="bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Scheduled Counts Calendar</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateMonth('prev')}
              className="px-2 py-1 border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 rounded-sm hover:bg-[#F3F2F1] dark:hover:bg-[#353535] active:scale-95 transition-all"
            >
              ‹
            </button>
            <span className="px-3 py-1 text-sm font-medium text-gray-800 dark:text-gray-200 min-w-[150px] text-center">
              {monthNames[currentMonth]} {currentYear}
            </span>
            <button
              onClick={() => navigateMonth('next')}
              className="px-2 py-1 border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 rounded-sm hover:bg-[#F3F2F1] dark:hover:bg-[#353535] active:scale-95 transition-all"
            >
              ›
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setCurrentMonth(now.getMonth());
                setCurrentYear(now.getFullYear());
              }}
              className="px-3 py-1 text-xs border border-[#C8C6C4] dark:border-[#505050] bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300 rounded-sm hover:bg-[#F3F2F1] dark:hover:bg-[#353535] active:scale-95 transition-all"
            >
              Today
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {/* Day headers */}
          {dayNames.map(day => (
            <div key={day} className="p-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-400">
              {day}
            </div>
          ))}
          
          {/* Calendar days */}
          {days.map((dayData, idx) => {
            if (dayData === null) {
              return <div key={`empty-${idx}`} className="p-2"></div>;
            }
            
            const { day, countsForDay, isToday, isPast } = dayData;
            
            return (
              <div
                key={day}
                onClick={() => countsForDay.length > 0 && setSelectedCalendarDate(dayData)}
                className={`p-2 min-h-[60px] border border-[#EDEBE9] dark:border-[#404040] rounded-sm ${
                  isToday 
                    ? 'bg-[#E8F4FD] dark:bg-[#1a3a52] border-[#0078D4] dark:border-[#0078D4]' 
                    : isPast
                    ? 'bg-[#F3F2F1] dark:bg-[#2a2a2a] opacity-60'
                    : 'bg-white dark:bg-[#2d2d2d] hover:bg-[#F3F2F1] dark:hover:bg-[#353535]'
                } ${countsForDay.length > 0 ? 'cursor-pointer' : ''} transition-colors`}
              >
                <div className={`text-sm font-medium mb-1 ${isToday ? 'text-[#0078D4] dark:text-[#4da6ff]' : 'text-gray-800 dark:text-gray-200'}`}>
                  {day}
                </div>
                {countsForDay.length > 0 && (
                  <div className="space-y-1">
                    {countsForDay.slice(0, 2).map((count, i) => (
                      <div
                        key={i}
                        className="text-xs px-1.5 py-0.5 bg-[#0078D4] dark:bg-[#0078D4] text-white rounded truncate"
                        title={`${count.company || 'Count'}${count.warehouse ? ` - ${count.warehouse}` : ''}${count.notes ? `: ${count.notes}` : ''}`}
                      >
                        {count.company || 'Count'}
                      </div>
                    ))}
                    {countsForDay.length > 2 && (
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        +{countsForDay.length - 2} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-[#EDEBE9] dark:border-[#404040] flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#E8F4FD] dark:bg-[#1a3a52] border border-[#0078D4] rounded"></div>
            <span>Today</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-[#0078D4] rounded"></div>
            <span>Scheduled Count</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-1">Welcome</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">Select your company and warehouse to get started</p>
      </div>

      {/* Calendar and Selection Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company and Warehouse Selection */}
        <div className="bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] p-6 grid gap-4 transition-shadow hover:shadow-[0_6px_12px_rgba(0,0,0,0.15),0_3px_6px_rgba(0,0,0,0.1)]">
        <div className="border-b border-[#EDEBE9] pb-4 mb-4">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Company and Warehouse Selection</h3>
        </div>
        
        {/* File upload for stock count */}
        <div className="grid gap-2">
          <label className="text-sm font-medium text-gray-700">
            Stock Count Data <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshExcel}
                disabled={refreshingExcel}
                className="px-4 py-2 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all text-sm shadow-[0_2px_4px_rgba(0,120,212,0.3)] hover:shadow-[0_4px_8px_rgba(0,120,212,0.4)] active:shadow-[0_1px_2px_rgba(0,120,212,0.3)] active:scale-[0.97]"
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
            <span className="text-xs text-gray-500">or</span>
            <label className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm hover:bg-[#F3F2F1] cursor-pointer text-sm font-medium shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)] transition-all active:scale-[0.97]">
              Upload File
              <input
                type="file"
                accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleStockCountFile}
                className="hidden"
              />
            </label>
          </div>
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
              className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all"
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
        
        {/* Company dropdown - only show when file is uploaded */}
        {fileUploaded && (
          <div className="grid gap-2">
            <label className="text-sm font-medium text-gray-700">Company</label>
            <select
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setSelectedWarehouse('');
              }}
              className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all"
            >
              <option value="">-- Select Company --</option>
              {companies.map(comp => (
                <option key={comp.code} value={comp.code}>
                  {comp.code} - {comp.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Warehouse dropdown - only show when file is uploaded and company is selected */}
        {fileUploaded && selectedCompany && (
          <div className="grid gap-2">
            <label className="text-sm font-medium text-gray-700">Warehouse</label>
            <select
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              className="px-3 py-2 border border-[#C8C6C4] bg-white text-gray-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-[#0078D4] focus:border-[#0078D4] disabled:bg-[#F3F2F1] disabled:text-gray-500 disabled:cursor-not-allowed shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all"
              disabled={warehouses.length === 0}
            >
              <option value="">-- Select Warehouse --</option>
              {warehouses.map(wh => (
                <option key={wh} value={wh}>
                  {wh}
                </option>
              ))}
            </select>
            {warehouses.length === 0 && (
              <div className="text-xs text-gray-500 bg-[#FFF4CE] px-2 py-1.5 rounded-sm mt-1">No warehouses found for this company</div>
            )}
          </div>
        )}

        {/* Final Count checkbox */}
        {fileUploaded && selectedCompany && (
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="finalCount"
              checked={isFinalCount}
              onChange={(e) => setIsFinalCount(e.target.checked)}
              className="w-4 h-4 text-[#0078D4] border-[#C8C6C4] rounded focus:ring-2 focus:ring-[#0078D4]"
            />
            <label htmlFor="finalCount" className="text-sm font-medium text-gray-700 cursor-pointer">
              Final Count
            </label>
          </div>
        )}

        <div className="flex gap-3 items-center pt-2">
          <button 
            onClick={saveSelection} 
            className="px-4 py-2 bg-[#0078D4] text-white rounded-sm hover:bg-[#106EBE] active:bg-[#005A9E] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-[0_2px_4px_rgba(0,120,212,0.3)] hover:shadow-[0_4px_8px_rgba(0,120,212,0.4)] active:shadow-[0_1px_2px_rgba(0,120,212,0.3)] active:scale-[0.97]"
            disabled={!fileUploaded || !selectedCompany || !selectedDate || !selectedWarehouse}
          >
            Start Count
          </button>
          {status && (
            <span className="ml-2 text-sm text-gray-600 bg-[#E1DFDD] px-3 py-1.5 rounded-sm">
              {status}
            </span>
          )}
        </div>
        
        {fileUploaded && selectedCompany && (
          <div className="text-sm text-gray-600 bg-[#F3F2F1] px-3 py-2 rounded-sm">
            <span className="font-medium">Selected:</span> {selectedCompany}{selectedWarehouse ? ` - ${selectedWarehouse}` : ''}
          </div>
        )}
        </div>

        {/* Calendar */}
        {renderCalendar()}
      </div>

      {/* Calendar Date Detail Modal */}
      {selectedCalendarDate && selectedCalendarDate.countsForDay.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedCalendarDate(null)}>
          <div className="bg-white dark:bg-[#2d2d2d] rounded-sm shadow-[0_8px_16px_rgba(0,0,0,0.2)] p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Scheduled Counts - {new Date(selectedCalendarDate.dateStr).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  weekday: 'long'
                })}
              </h3>
              <button
                onClick={() => setSelectedCalendarDate(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {selectedCalendarDate.countsForDay.map((count, idx) => (
                <div key={idx} className="p-4 border border-[#EDEBE9] dark:border-[#404040] rounded-sm bg-[#F3F2F1] dark:bg-[#353535]">
                  <div className="grid gap-2 text-sm">
                    {count.company && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Company:</span>
                        <span className="ml-2 text-gray-800 dark:text-gray-200">{count.company}</span>
                      </div>
                    )}
                    {count.warehouse && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Warehouse:</span>
                        <span className="ml-2 text-gray-800 dark:text-gray-200">{count.warehouse}</span>
                      </div>
                    )}
                    {count.notes && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Notes:</span>
                        <span className="ml-2 text-gray-800 dark:text-gray-200">{count.notes}</span>
                      </div>
                    )}
                    {!count.company && !count.warehouse && !count.notes && (
                      <div className="text-gray-600 dark:text-gray-400">Scheduled count (no additional details)</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Final Counts History - Collapsible Section */}
      {finalCounts.length > 0 && (
        <div className="bg-white dark:bg-[#2d2d2d] rounded-sm border border-[#EDEBE9] dark:border-[#404040] shadow-[0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_6px_12px_rgba(0,0,0,0.15),0_3px_6px_rgba(0,0,0,0.1)]">
          <button
            onClick={() => setFinalCountsCollapsed(!finalCountsCollapsed)}
            className="w-full flex items-center justify-between p-4 border-b border-[#EDEBE9] hover:bg-[#F3F2F1] transition-colors"
          >
            <h3 className="text-base font-semibold text-gray-800">Final Counts History</h3>
            <span className="text-gray-600 text-sm">
              {finalCountsCollapsed ? '▼' : '▲'}
            </span>
          </button>
          {!finalCountsCollapsed && (
            <div className="p-6">
              <div className="overflow-auto border border-[#EDEBE9] rounded-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#F3F2F1] border-b border-[#EDEBE9]">
                    <tr>
                      <th className="p-3 text-left font-semibold text-gray-800">Date</th>
                      <th className="p-3 text-left font-semibold text-gray-800">Company</th>
                      <th className="p-3 text-left font-semibold text-gray-800">Warehouse</th>
                      <th className="p-3 text-left font-semibold text-gray-800">Stock Take Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalCounts.map((count, idx) => {
                      const countDate = new Date(count.timestamp);
                      const formattedDate = countDate.toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                      const stockTakeDate = count.date 
                        ? `${count.date.slice(0, 2)}/${count.date.slice(2, 4)}/${count.date.slice(4, 8)}`
                        : '-';
                      
                      return (
                        <tr key={idx} className="border-b border-[#EDEBE9] hover:bg-[#F3F2F1]">
                          <td className="p-3 text-gray-800">{formattedDate}</td>
                          <td className="p-3 text-gray-800">{count.company || '-'}</td>
                          <td className="p-3 text-gray-800">{count.warehouse || '-'}</td>
                          <td className="p-3 text-gray-800">{stockTakeDate}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}



