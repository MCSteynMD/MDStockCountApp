import { Outlet, Link, useLocation } from 'react-router-dom';

export default function AppLayout() {
  const { pathname } = useLocation();
  const hasVisitedHome = sessionStorage.getItem('hasVisitedHome');
  
  const navLink = (to, label) => {
    // Only show navigation links if user has visited Home
    if (!hasVisitedHome && to !== '/') {
      return null;
    }
    
    const isActive = pathname === to;
    return (
      <Link
        to={to}
        className={`px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'text-[#0078D4] border-b-2 border-[#0078D4] pb-2'
            : 'text-gray-600 hover:text-[#0078D4] hover:bg-gray-50'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[#FAF9F8]">
      <header className="bg-white border-b border-[#EDEBE9] shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-gray-800">Stock Control</h1>
          </div>
          {hasVisitedHome && (
            <nav className="flex items-center gap-1">
              {navLink('/', 'Home')}
              {navLink('/summary', 'Summary')}
              {navLink('/reconcile', 'Reconcile')}
            </nav>
          )}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </main>
      <footer className="bg-white border-t border-[#EDEBE9] mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 text-sm text-gray-500">
          © 2024 Stock Control
        </div>
      </footer>
    </div>
  );
}


