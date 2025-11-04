import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user has visited Home page
    const hasVisitedHome = sessionStorage.getItem('hasVisitedHome');
    
    if (!hasVisitedHome) {
      // Redirect to Home if not visited
      navigate('/', { replace: true });
    }
  }, [navigate]);

  // Check if user has visited Home before rendering children
  const hasVisitedHome = sessionStorage.getItem('hasVisitedHome');
  
  if (!hasVisitedHome) {
    return null; // Don't render while redirecting
  }

  return children;
}

