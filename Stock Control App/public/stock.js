// Stock management functionality
let stockItems = [];
let currentPage = 1;
let totalPages = 1;
let currentFilter = '';
let currentCategory = '';

// Initialize stock page
document.addEventListener('DOMContentLoaded', function() {
    if (getCurrentPage() === 'stock') {
        initializeStockPage();
    }
});

function initializeStockPage() {
    setupStockEventListeners();
    loadStockItems();
    loadCategories();
}

function setupStockEventListeners() {
    // Add item button
    const addItemBtn = document.getElementById('addItemBtn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', () => openItemModal());
    }

    // Item form submission
    const itemForm = document.getElementById('itemForm');
    if (itemForm) {
        itemForm.addEventListener('submit', handleItemSubmit);
    }

    // Stock update form submission
    const stockUpdateForm = document.getElementById('stockUpdateForm');
    if (stockUpdateForm) {
        stockUpdateForm.addEventListener('submit', handleStockUpdate);
    }

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }

    // Category filter
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', handleCategoryFilter);
    }

    // Low stock filter
    const lowStockBtn = document.getElementById('lowStockBtn');
    if (lowStockBtn) {
        lowStockBtn.addEventListener('click', handleLowStockFilter);
    }
}

async function loadStockItems(page = 1) {
    try {
        showLoading('stockTableBody');
        
        const params = new URLSearchParams({
            page: page,
            limit: 10,
            search: currentFilter,
            category: currentCategory
        });
        
        const data = await apiRequest(`/stock?${params}`);
        stockItems = data.stockItems;
        currentPage = parseInt(data.currentPage);
        totalPages = parseInt(data.totalPages);
        
        renderStockTable();
        renderPagination();
    } catch (error) {
        console.error('Failed to load stock items:', error);
        showMessage('Failed to load stock items: ' + error.message, 'error');
        document.getElementById('stockTableBody').innerHTML = 
            '<tr><td colspan="9" class="loading">Error loading stock items</td></tr>';
    }
}

async function loadCategories() {
    try {
        const data = await apiRequest('/stock/categories/list');
        const categoryFilter = document.getElementById('categoryFilter');
        
        if (categoryFilter && data.categories) {
            categoryFilter.innerHTML = '<option value="">All Categories</option>' +
                data.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        }
    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

function renderStockTable() {
    const tbody = document.getElementById('stockTableBody');
    if (!tbody) return;

    if (stockItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">No stock items found</td></tr>';
        return;
    }

    tbody.innerHTML = stockItems.map(item => {
        const totalValue = item.currentStock * item.unitPrice;
        const isLowStock = item.currentStock <= item.minimumStock;
        const isOutOfStock = item.currentStock === 0;
        
        let statusClass = 'status-active';
        let statusText = 'Normal';
        
        if (isOutOfStock) {
            statusClass = 'status-out-of-stock';
            statusText = 'Out of Stock';
        } else if (isLowStock) {
            statusClass = 'status-low-stock';
            statusText = 'Low Stock';
        }

        return `
            <tr>
                <td><strong>${item.itemCode}</strong></td>
                <td>${item.itemName}</td>
                <td>${item.category}</td>
                <td><strong>${item.currentStock}</strong></td>
                <td>${item.minimumStock}</td>
                <td>${formatCurrency(item.unitPrice)}</td>
                <td><strong>${formatCurrency(totalValue)}</strong></td>
                <td>
                    <span class="status-badge ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td>
                    <button onclick="updateStock('${item._id}')" class="btn btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-right: 0.25rem;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="editItem('${item._id}')" class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">
                        <i class="fas fa-cog"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPagination() {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let paginationHTML = '';
    
    // Previous button
    if (currentPage > 1) {
        paginationHTML += `<button onclick="loadStockItems(${currentPage - 1})">Previous</button>`;
    }
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            paginationHTML += `<button class="active">${i}</button>`;
        } else {
            paginationHTML += `<button onclick="loadStockItems(${i})">${i}</button>`;
        }
    }
    
    // Next button
    if (currentPage < totalPages) {
        paginationHTML += `<button onclick="loadStockItems(${currentPage + 1})">Next</button>`;
    }
    
    pagination.innerHTML = paginationHTML;
}

function openItemModal(itemId = null) {
    const modal = document.getElementById('itemModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('itemForm');
    
    editingItemId = itemId;
    
    if (itemId) {
        // Edit mode
        modalTitle.textContent = 'Edit Item';
        const item = stockItems.find(i => i._id === itemId);
        if (item) {
            populateItemForm(item);
        }
    } else {
        // Add mode
        modalTitle.textContent = 'Add New Item';
        form.reset();
    }
    
    modal.style.display = 'block';
}

function populateItemForm(item) {
    document.getElementById('itemCode').value = item.itemCode || '';
    document.getElementById('itemName').value = item.itemName || '';
    document.getElementById('description').value = item.description || '';
    document.getElementById('category').value = item.category || '';
    document.getElementById('supplier').value = item.supplier || '';
    document.getElementById('currentStock').value = item.currentStock || 0;
    document.getElementById('unitPrice').value = item.unitPrice || 0;
    document.getElementById('minimumStock').value = item.minimumStock || 0;
    document.getElementById('maximumStock').value = item.maximumStock || 1000;
    document.getElementById('location').value = item.location || '';
}

async function handleItemSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const itemData = {
        itemCode: formData.get('itemCode'),
        itemName: formData.get('itemName'),
        description: formData.get('description'),
        category: formData.get('category'),
        supplier: formData.get('supplier'),
        currentStock: parseInt(formData.get('currentStock')),
        unitPrice: parseFloat(formData.get('unitPrice')),
        minimumStock: parseInt(formData.get('minimumStock')),
        maximumStock: parseInt(formData.get('maximumStock')),
        location: formData.get('location')
    };

    try {
        if (editingItemId) {
            // Update existing item
            await apiRequest(`/stock/${editingItemId}`, {
                method: 'PUT',
                body: JSON.stringify(itemData)
            });
            showMessage('Item updated successfully', 'success');
        } else {
            // Create new item
            await apiRequest('/stock', {
                method: 'POST',
                body: JSON.stringify(itemData)
            });
            showMessage('Item created successfully', 'success');
        }
        
        closeModal();
        loadStockItems(currentPage);
        loadCategories(); // Refresh categories in case new one was added
    } catch (error) {
        console.error('Item operation failed:', error);
        showMessage('Operation failed: ' + error.message, 'error');
    }
}

function updateStock(itemId) {
    const item = stockItems.find(i => i._id === itemId);
    if (!item) return;

    const modal = document.getElementById('stockUpdateModal');
    const form = document.getElementById('stockUpdateForm');
    
    // Store the item ID for the form submission
    form.dataset.itemId = itemId;
    
    // Reset form
    form.reset();
    
    modal.style.display = 'block';
}

async function handleStockUpdate(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const itemId = e.target.dataset.itemId;
    
    const updateData = {
        quantity: parseInt(formData.get('quantity')),
        transactionType: formData.get('transactionType'),
        reason: formData.get('reason'),
        reference: formData.get('reference')
    };

    try {
        await apiRequest(`/stock/${itemId}/update-stock`, {
            method: 'POST',
            body: JSON.stringify(updateData)
        });
        
        showMessage('Stock updated successfully', 'success');
        closeStockModal();
        loadStockItems(currentPage);
    } catch (error) {
        console.error('Stock update failed:', error);
        showMessage('Failed to update stock: ' + error.message, 'error');
    }
}

function editItem(itemId) {
    openItemModal(itemId);
}

function handleSearch(e) {
    currentFilter = e.target.value;
    currentPage = 1;
    loadStockItems();
}

function handleCategoryFilter(e) {
    currentCategory = e.target.value;
    currentPage = 1;
    loadStockItems();
}

async function handleLowStockFilter() {
    try {
        const data = await apiRequest('/stock/alerts/low-stock');
        stockItems = data.lowStockItems;
        currentPage = 1;
        totalPages = 1;
        
        renderStockTable();
        renderPagination();
        
        showMessage(`Found ${stockItems.length} low stock items`, 'info');
    } catch (error) {
        console.error('Failed to load low stock items:', error);
        showMessage('Failed to load low stock items: ' + error.message, 'error');
    }
}

function closeModal() {
    const modal = document.getElementById('itemModal');
    if (modal) {
        modal.style.display = 'none';
    }
    editingItemId = null;
}

function closeStockModal() {
    const modal = document.getElementById('stockUpdateModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Close modals when clicking outside
window.addEventListener('click', function(event) {
    const itemModal = document.getElementById('itemModal');
    const stockModal = document.getElementById('stockUpdateModal');
    
    if (event.target === itemModal) {
        closeModal();
    }
    if (event.target === stockModal) {
        closeStockModal();
    }
});

// Export functions for global access
window.updateStock = updateStock;
window.editItem = editItem;
window.closeModal = closeModal;
window.closeStockModal = closeStockModal;
window.loadStockItems = loadStockItems;
