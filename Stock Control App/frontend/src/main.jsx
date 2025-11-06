import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { ThemeProvider } from './theme/ThemeContext'
import AppLayout from './shell/AppLayout'
import Home from './pages/Home'
import Reconcile from './pages/Reconcile'
import Summary from './pages/Summary'
import ProtectedRoute from './components/ProtectedRoute'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Home /> },
      { 
        path: 'reconcile', 
        element: (
          <ProtectedRoute>
            <Reconcile />
          </ProtectedRoute>
        ) 
      },
      { 
        path: 'summary', 
        element: <Summary />
      },
      // Redirect any unknown routes to Home
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>,
)
