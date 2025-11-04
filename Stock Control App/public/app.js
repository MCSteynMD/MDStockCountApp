// Global app configuration and utilities
const API_BASE = '/api';

// Authentication state
let currentUser = null;
let isAuthenticated = false;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    // Check if user is already logged in
    await checkAuthStatus();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load initial data based on current page
    loadPageData();
}

async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`);
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            isAuthenticated = true;
            updateUIForAuthenticatedUser();
        } else {
            showLoginForm();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showLoginForm();
    }
}

function updateUIForAuthenticatedUser() {
    // Hide login form and show dashboard
    const loginSection = document.getElementById('loginSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');
    const dashboardUserName = document.getElementById('dashboardUserName');
    const adminCard = document.getElementById('adminCard');

    if (loginSection) loginSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'block';
    if (userInfo) userInfo.style.display = 'flex';
    if (userName) userName.textContent = `${currentUser.firstName} ${currentUser.lastName}`;
    if (dashboardUserName) dashboardUserName.textContent = currentUser.firstName;
    
    // Show admin card if user is admin
    if (adminCard && currentUser.role === 'admin') {
        adminCard.style.display = 'block';
    }

    // Load quick stats for dashboard
    if (dashboardSection) {
        loadQuickStats();
    }
}

function showLoginForm() {
    const loginSection = document.getElementById('loginSection');
    const dashboardSection = document.getElementById('dashboardSection');
    const userInfo = document.getElementById('userInfo');

    if (loginSection) loginSection.style.display = 'block';
    if (dashboardSection) dashboardSection.style.display = 'none';
    if (userInfo) userInfo.style.display = 'none';
}

function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const loginData = {
        email: formData.get('email'),
        password: formData.get('password')
    };

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(loginData)
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            isAuthenticated = true;
            updateUIForAuthenticatedUser();
            hideError('loginError');
        } else {
            showError('loginError', data.message || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('loginError', 'Network error. Please try again.');
    }
}

async function handleLogout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST'
        });
        
        currentUser = null;
        isAuthenticated = false;
        showLoginForm();
    } catch (error) {
        console.error('Logout error:', error);
        // Still logout locally even if server request fails
        currentUser = null;
        isAuthenticated = false;
        showLoginForm();
    }
}

function loadPageData() {
    const currentPage = getCurrentPage();
    
    switch (currentPage) {
        case 'admin':
            if (typeof loadUsers === 'function') loadUsers();
            break;
        case 'stock':
            if (typeof loadStockItems === 'function') loadStockItems();
            break;
        case 'reports':
            if (typeof loadReports === 'function') loadReports();
            break;
        default:
            // Home page - already handled in updateUIForAuthenticatedUser
            break;
    }
}

function getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('/admin')) return 'admin';
    if (path.includes('/stock')) return 'stock';
    if (path.includes('/reports')) return 'reports';
    return 'home';
}

async function loadQuickStats() {
    try {
        const response = await fetch(`${API_BASE}/reports/stock-summary`);
        if (response.ok) {
            const data = await response.json();
            updateQuickStats(data.summary);
        }
    } catch (error) {
        console.error('Failed to load quick stats:', error);
    }
}

function updateQuickStats(summary) {
    const totalItems = document.getElementById('totalItems');
    const lowStockItems = document.getElementById('lowStockItems');
    const totalValue = document.getElementById('totalValue');

    if (totalItems) totalItems.textContent = summary.totalItems || 0;
    if (lowStockItems) lowStockItems.textContent = summary.lowStockItems || 0;
    if (totalValue) totalValue.textContent = formatCurrency(summary.totalValue || 0);
}

function navigateToPage(page) {
    if (!isAuthenticated) {
        showError('loginError', 'Please login first');
        return;
    }

    // Check admin access for admin page
    if (page === 'admin' && currentUser.role !== 'admin') {
        alert('Admin access required');
        return;
    }

    const baseUrl = window.location.origin;
    let url = baseUrl;
    
    if (page === 'stock') url += '/stock';
    else if (page === 'reports') url += '/reports';
    else if (page === 'admin') url += '/admin';
    
    window.location.href = url;
}

// Utility functions
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function hideError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.style.display = 'none';
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '<td colspan="100%" class="loading">Loading...</td>';
    }
}

function showMessage(message, type = 'info') {
    // Create a temporary message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'};
        color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};
        border: 1px solid ${type === 'success' ? '#c3e6cb' : type === 'error' ? '#f5c6cb' : '#bee5eb'};
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(messageDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// API helper functions
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };
    
    const response = await fetch(url, { ...defaultOptions, ...options });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
}

// Export functions for use in other scripts
window.navigateToPage = navigateToPage;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.showMessage = showMessage;
window.apiRequest = apiRequest;
window.currentUser = () => currentUser;
window.isAuthenticated = () => isAuthenticated;
