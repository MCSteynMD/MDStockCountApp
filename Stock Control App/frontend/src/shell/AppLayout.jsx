import { Outlet, Link, useLocation, useNavigationType } from 'react-router-dom';
import { useEffect, useState } from 'react';
import UsernameEntry from '../components/UsernameEntry';

export default function AppLayout() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const [hasVisitedHome, setHasVisitedHome] = useState(() => {
    // Check on initial render
    return sessionStorage.getItem('hasVisitedHome') === 'true';
  });
  const [countDisplay, setCountDisplay] = useState(0);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [username, setUsername] = useState('');
  const [showUsernameEntry, setShowUsernameEntry] = useState(false);
  
  // Check for hasVisitedHome on mount and when pathname changes
  useEffect(() => {
    const visited = sessionStorage.getItem('hasVisitedHome') === 'true';
    if (visited !== hasVisitedHome) {
      setHasVisitedHome(visited);
    }
  }, [pathname, hasVisitedHome]);
  
  // Load username on mount
  useEffect(() => {
    const storedUsername = sessionStorage.getItem('username');
    if (storedUsername) {
      setUsername(storedUsername);
    } else {
      setShowUsernameEntry(true);
    }
  }, []);

  // Function to update count display from sessionStorage
  const updateCountDisplay = () => {
    try {
      const savedCountsStr = sessionStorage.getItem('savedCounts');
      if (savedCountsStr) {
        const savedCounts = JSON.parse(savedCountsStr);
        setCountDisplay(savedCounts.length);
      } else {
        setCountDisplay(0);
      }
    } catch (error) {
      console.error('Error reading savedCounts:', error);
      setCountDisplay(0);
    }
  };
  
  // Update count display on mount and when navigating
  useEffect(() => {
    updateCountDisplay();
    
    // Listen for storage events (when counts are added/removed in other tabs/components)
    const handleStorageChange = (e) => {
      if (e.key === 'savedCounts' || e.key === null) {
        updateCountDisplay();
      }
    };
    
    // Listen for custom event when counts are updated
    const handleCountsUpdate = () => {
      updateCountDisplay();
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('countsUpdated', handleCountsUpdate);
    
    // Poll for changes (since storage event doesn't fire in same tab)
    const interval = setInterval(updateCountDisplay, 1000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('countsUpdated', handleCountsUpdate);
      clearInterval(interval);
    };
  }, [pathname]);
  
  // Handle page refresh - clear data if user confirms
  useEffect(() => {
    // Mark that app has been initialized (to distinguish from first visit)
    sessionStorage.setItem('app_initialized', 'true');
    
    // Track navigation type - if it's PUSH or REPLACE, we're navigating via router
    if (navigationType === 'PUSH' || navigationType === 'REPLACE') {
      sessionStorage.setItem('navigating_via_router', 'true');
      // Clear the flag after a delay
      const timeoutId = setTimeout(() => {
        sessionStorage.removeItem('navigating_via_router');
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [navigationType]);
  
  // Separate effect for beforeunload handler
  useEffect(() => {
    // Handle beforeunload (refresh/close)
    const handleBeforeUnload = (e) => {
      // Check if we're navigating via router
      const navigatingViaRouter = sessionStorage.getItem('navigating_via_router');
      const isInitialized = sessionStorage.getItem('app_initialized');
      
      // Only show confirmation if app is initialized and not navigating via router
      if (isInitialized && !navigatingViaRouter) {
        // Set flag to clear on next load (if they proceed with refresh)
        sessionStorage.setItem('pending_refresh_clear', 'true');
        // Show browser confirmation dialog
        e.preventDefault();
        e.returnValue = 'Refreshing will clear all app data. Are you sure you want to continue?';
        return e.returnValue;
      }
    };
    
    // Check on mount if we should clear (user confirmed refresh on previous page)
    const pendingClear = sessionStorage.getItem('pending_refresh_clear');
    if (pendingClear) {
      // Clear all sessionStorage data
      sessionStorage.clear();
      // Re-mark as initialized
      sessionStorage.setItem('app_initialized', 'true');
    }
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const handleUsernameSet = (name) => {
    setUsername(name);
    setShowUsernameEntry(false);
  };

  // Get initials from username
  const getInitials = (name) => {
    if (!name) return 'SC';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const navItems = [
    { 
      to: '/', 
      label: 'Home', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    { 
      to: '/summary', 
      label: 'Summary', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    },
    { 
      to: '/report', 
      label: 'Report', 
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    },
  ];


  return (
    <div className="min-h-screen bg-[#FAF9F8] dark:bg-[#1a1a1a] flex">
      {/* Username Entry Modal */}
      {showUsernameEntry && (
        <UsernameEntry onUsernameSet={handleUsernameSet} />
      )}

      {/* Sidebar Navigation - Always visible */}
      <aside className={`${sidebarExpanded ? 'w-56' : 'w-16'} bg-[#1a1a1a] transition-all duration-300 overflow-hidden flex flex-col py-4 border-r border-[#2d2d2d] z-10 flex-shrink-0 min-h-screen`}>
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="mb-6 mx-auto text-white hover:bg-[#2d2d2d] rounded p-2 transition-all active:scale-95"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {sidebarExpanded ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          {navItems.map((item) => {
            const isActive = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center mb-2 mx-2 rounded transition-all ${
                  isActive
                    ? 'bg-[#E1DFDD] dark:bg-[#404040] text-gray-800 dark:text-gray-200'
                    : 'text-gray-400 hover:bg-[#2d2d2d] hover:text-white'
                } ${sidebarExpanded ? 'px-3 py-2' : 'w-12 h-12 justify-center'}`}
                title={item.label}
              >
                <span className={`flex-shrink-0 ${sidebarExpanded ? 'mr-3' : ''}`}>
                  {item.icon}
                </span>
                {sidebarExpanded && (
                  <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );
          })}
        </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Dark Header */}
        <header className="bg-[#1a1a1a] text-white border-b border-[#2d2d2d] shadow-[0_2px_4px_rgba(0,0,0,0.2)]">
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-lg font-semibold">Stock Control</h1>
            </div>
            <div className="flex items-center gap-3">
              {hasVisitedHome && countDisplay > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#0078D4] text-white rounded text-sm font-medium shadow-[0_2px_4px_rgba(0,120,212,0.3)]">
                  <span>Counts:</span>
                  <span className="font-bold">{countDisplay}</span>
                </div>
              )}
              <Link
                to="/settings"
                className="text-gray-400 hover:text-white hover:bg-[#2d2d2d] rounded p-2 transition-all active:scale-95"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
                      <div className="w-8 h-8 rounded-full bg-[#0078D4] flex items-center justify-center text-white font-semibold text-sm">
                {getInitials(username)}
              </div>
            </div>
          </div>
        </header>

        {/* Banner Area with Rock Texture Background */}
        <div className="relative h-64 bg-[#2d1f16] overflow-hidden">
          {/* Base rock texture with multiple layers */}
          <div 
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 800px 600px at 20% 30%, rgba(139, 90, 43, 0.6) 0%, transparent 60%),
                radial-gradient(ellipse 700px 500px at 80% 70%, rgba(101, 67, 33, 0.7) 0%, transparent 55%),
                radial-gradient(ellipse 600px 400px at 50% 50%, rgba(80, 50, 25, 0.8) 0%, transparent 50%),
                radial-gradient(ellipse 500px 350px at 35% 60%, rgba(120, 75, 40, 0.5) 0%, transparent 45%),
                linear-gradient(135deg, rgba(60, 40, 20, 0.9) 0%, rgba(40, 25, 15, 0.95) 50%, rgba(30, 20, 10, 1) 100%),
                linear-gradient(45deg, rgba(90, 60, 30, 0.4) 0%, transparent 30%),
                #2d1f16
              `,
              backgroundSize: '100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%',
            }}
          />
          
          {/* Blue/teal mineral deposits in crevices */}
          <div 
            className="absolute inset-0 opacity-50"
            style={{
              background: `
                radial-gradient(ellipse 300px 200px at 15% 25%, rgba(0, 150, 200, 0.6) 0%, transparent 50%),
                radial-gradient(ellipse 400px 300px at 85% 75%, rgba(0, 120, 180, 0.5) 0%, transparent 60%),
                radial-gradient(ellipse 350px 250px at 45% 55%, rgba(0, 180, 220, 0.55) 0%, transparent 55%),
                radial-gradient(ellipse 250px 180px at 70% 40%, rgba(0, 160, 210, 0.45) 0%, transparent 50%),
                radial-gradient(ellipse 200px 150px at 25% 80%, rgba(0, 140, 190, 0.5) 0%, transparent 45%)
              `,
              backgroundSize: '100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%',
              mixBlendMode: 'screen',
            }}
          />
          
          {/* Crack/fissure patterns */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `
                repeating-linear-gradient(
                  45deg,
                  transparent,
                  transparent 2px,
                  rgba(20, 15, 10, 0.3) 2px,
                  rgba(20, 15, 10, 0.3) 4px
                ),
                repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 3px,
                  rgba(15, 10, 5, 0.2) 3px,
                  rgba(15, 10, 5, 0.2) 6px
                )
              `,
            }}
          />
          
          {/* Highlights on raised surfaces */}
          <div 
            className="absolute inset-0 opacity-40"
            style={{
              background: `
                radial-gradient(ellipse 200px 150px at 30% 20%, rgba(180, 140, 100, 0.4) 0%, transparent 40%),
                radial-gradient(ellipse 150px 100px at 75% 30%, rgba(160, 120, 80, 0.35) 0%, transparent 35%),
                linear-gradient(135deg, transparent 0%, rgba(120, 90, 60, 0.2) 50%, transparent 100%)
              `,
              backgroundSize: '100% 100%, 100% 100%, 100% 100%',
            }}
          />
          
          {/* Noise texture for granularity */}
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />
          
        </div>

        {/* Announcement Banner (optional - can be shown/hidden) */}
        {hasVisitedHome && (
          <div className="bg-gradient-to-r from-[#e8d5ff] to-[#f0e5ff] dark:from-[#2d1f3d] dark:to-[#352545] border-b border-[#d0b0ff] dark:border-[#4a3a5a] px-6 py-3 shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                  ✨
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    Welcome to Stock Control - Streamline your inventory management with powerful tracking and reporting tools.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 bg-[#FAF9F8] dark:bg-[#1a1a1a] px-6 py-6">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
