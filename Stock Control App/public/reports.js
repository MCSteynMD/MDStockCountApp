// Reports page functionality
let categoryChart = null;
let valueChart = null;

// Initialize reports page
document.addEventListener('DOMContentLoaded', function() {
    if (getCurrentPage() === 'reports') {
        initializeReportsPage();
    }
});

function initializeReportsPage() {
    setupReportsEventListeners();
    loadReports();
}

function setupReportsEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('refreshReportsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadReports);
    }

    // Export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportReports);
    }

    // Filter movement button
    const filterMovementBtn = document.getElementById('filterMovementBtn');
    if (filterMovementBtn) {
        filterMovementBtn.addEventListener('click', loadStockMovement);
    }
}

async function loadReports() {
    try {
        await Promise.all([
            loadStockSummary(),
            loadRecentTransactions(),
            loadUserActivity(),
            loadInventoryValuation()
        ]);
    } catch (error) {
        console.error('Failed to load reports:', error);
        showMessage('Failed to load reports: ' + error.message, 'error');
    }
}

async function loadStockSummary() {
    try {
        const data = await apiRequest('/reports/stock-summary');
        
        // Update summary cards
        document.getElementById('totalItems').textContent = data.summary.totalItems || 0;
        document.getElementById('totalValue').textContent = formatCurrency(data.summary.totalValue || 0);
        document.getElementById('lowStockItems').textContent = data.summary.lowStockItems || 0;
        document.getElementById('outOfStockItems').textContent = data.summary.outOfStockItems || 0;
        
        // Create charts
        createCategoryChart(data.categoryStats);
        createValueChart(data.categoryStats);
    } catch (error) {
        console.error('Failed to load stock summary:', error);
    }
}

function createCategoryChart(categoryStats) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx || !categoryStats) return;

    // Destroy existing chart
    if (categoryChart) {
        categoryChart.destroy();
    }

    const labels = categoryStats.map(stat => stat._id);
    const data = categoryStats.map(stat => stat.count);

    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#667eea',
                    '#764ba2',
                    '#f093fb',
                    '#f5576c',
                    '#4facfe',
                    '#00f2fe',
                    '#43e97b',
                    '#38f9d7'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function createValueChart(categoryStats) {
    const ctx = document.getElementById('valueChart');
    if (!ctx || !categoryStats) return;

    // Destroy existing chart
    if (valueChart) {
        valueChart.destroy();
    }

    const labels = categoryStats.map(stat => stat._id);
    const data = categoryStats.map(stat => stat.totalValue);

    valueChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Value',
                data: data,
                backgroundColor: '#667eea',
                borderColor: '#764ba2',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

async function loadRecentTransactions() {
    try {
        const data = await apiRequest('/reports/recent-transactions?limit=20');
        renderTransactionsTable(data.transactions);
    } catch (error) {
        console.error('Failed to load recent transactions:', error);
        document.getElementById('transactionsTableBody').innerHTML = 
            '<tr><td colspan="7" class="loading">Error loading transactions</td></tr>';
    }
}

function renderTransactionsTable(transactions) {
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No transactions found</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map(transaction => `
        <tr>
            <td>${transaction.itemId.itemName} (${transaction.itemId.itemCode})</td>
            <td>
                <span class="status-badge ${getTransactionTypeClass(transaction.transactionType)}">
                    ${transaction.transactionType.toUpperCase()}
                </span>
            </td>
            <td>${transaction.quantity}</td>
            <td>${transaction.previousStock}</td>
            <td>${transaction.newStock}</td>
            <td>${transaction.performedBy.firstName} ${transaction.performedBy.lastName}</td>
            <td>${formatDate(transaction.timestamp)}</td>
        </tr>
    `).join('');
}

function getTransactionTypeClass(type) {
    switch (type) {
        case 'in': return 'status-active';
        case 'out': return 'status-inactive';
        case 'adjustment': return 'status-low-stock';
        default: return 'status-active';
    }
}

async function loadStockMovement() {
    try {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
        
        const data = await apiRequest(`/reports/stock-movement?${params}`);
        renderMovementTable(data.movements);
    } catch (error) {
        console.error('Failed to load stock movement:', error);
        document.getElementById('movementTableBody').innerHTML = 
            '<tr><td colspan="8" class="loading">Error loading movement data</td></tr>';
    }
}

function renderMovementTable(movements) {
    const tbody = document.getElementById('movementTableBody');
    if (!tbody) return;

    if (movements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No movement data found</td></tr>';
        return;
    }

    tbody.innerHTML = movements.map(movement => `
        <tr>
            <td>${movement.itemName} (${movement.itemCode})</td>
            <td>
                <span class="status-badge ${getTransactionTypeClass(movement.transactionType)}">
                    ${movement.transactionType.toUpperCase()}
                </span>
            </td>
            <td>${movement.quantity}</td>
            <td>${movement.previousStock}</td>
            <td>${movement.newStock}</td>
            <td>${movement.reason || '-'}</td>
            <td>${movement.performedBy}</td>
            <td>${formatDate(movement.timestamp)}</td>
        </tr>
    `).join('');
}

async function loadUserActivity() {
    try {
        const data = await apiRequest('/reports/user-activity');
        renderActivityTable(data.userActivity);
    } catch (error) {
        console.error('Failed to load user activity:', error);
        document.getElementById('activityTableBody').innerHTML = 
            '<tr><td colspan="6" class="loading">Error loading user activity</td></tr>';
    }
}

function renderActivityTable(userActivity) {
    const tbody = document.getElementById('activityTableBody');
    if (!tbody) return;

    if (userActivity.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">No user activity found</td></tr>';
        return;
    }

    tbody.innerHTML = userActivity.map(activity => `
        <tr>
            <td>${activity.userName}</td>
            <td>${activity.userEmail}</td>
            <td>${activity.transactionCount}</td>
            <td>${activity.totalQuantityIn}</td>
            <td>${activity.totalQuantityOut}</td>
            <td>${formatDate(activity.lastActivity)}</td>
        </tr>
    `).join('');
}

async function loadInventoryValuation() {
    try {
        const data = await apiRequest('/reports/inventory-valuation');
        
        // Update valuation summary
        document.getElementById('totalInventoryValue').textContent = 
            formatCurrency(data.valuation.totalValue || 0);
        document.getElementById('averageItemValue').textContent = 
            formatCurrency(data.valuation.averageValue || 0);
        document.getElementById('totalQuantity').textContent = 
            data.valuation.totalQuantity || 0;
        
        // Render top value items
        renderTopValueTable(data.topValueItems);
    } catch (error) {
        console.error('Failed to load inventory valuation:', error);
    }
}

function renderTopValueTable(topValueItems) {
    const tbody = document.getElementById('topValueTableBody');
    if (!tbody) return;

    if (topValueItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">No items found</td></tr>';
        return;
    }

    tbody.innerHTML = topValueItems.map(item => {
        const totalValue = item.currentStock * item.unitPrice;
        return `
            <tr>
                <td>${item.itemName}</td>
                <td>${item.itemCode}</td>
                <td>${item.currentStock}</td>
                <td>${formatCurrency(item.unitPrice)}</td>
                <td><strong>${formatCurrency(totalValue)}</strong></td>
            </tr>
        `;
    }).join('');
}

function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => button.classList.remove('active'));
    
    // Show selected tab content
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Add active class to clicked button
    const clickedButton = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (clickedButton) {
        clickedButton.classList.add('active');
    }
    
    // Load data for specific tabs
    if (tabName === 'stock-movement') {
        loadStockMovement();
    }
}

function exportReports() {
    // Simple CSV export functionality
    const data = {
        summary: {
            totalItems: document.getElementById('totalItems').textContent,
            totalValue: document.getElementById('totalValue').textContent,
            lowStockItems: document.getElementById('lowStockItems').textContent,
            outOfStockItems: document.getElementById('outOfStockItems').textContent
        }
    };
    
    const csvContent = `Report Type,Value
Total Items,${data.summary.totalItems}
Total Value,${data.summary.totalValue}
Low Stock Items,${data.summary.lowStockItems}
Out of Stock Items,${data.summary.outOfStockItems}`;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showMessage('Report exported successfully', 'success');
}

// Export functions for global access
window.showTab = showTab;
window.exportReports = exportReports;
