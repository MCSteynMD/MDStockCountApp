// Admin page functionality
let users = [];
let editingUserId = null;

// Initialize admin page
document.addEventListener('DOMContentLoaded', function() {
    if (getCurrentPage() === 'admin') {
        initializeAdminPage();
    }
});

function initializeAdminPage() {
    setupAdminEventListeners();
    loadUsers();
}

function setupAdminEventListeners() {
    // Add user button
    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => openUserModal());
    }

    // User form submission
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', handleUserSubmit);
    }
}

async function loadUsers() {
    try {
        showLoading('usersTableBody');
        
        const data = await apiRequest('/users');
        users = data.users;
        renderUsersTable();
    } catch (error) {
        console.error('Failed to load users:', error);
        showMessage('Failed to load users: ' + error.message, 'error');
        document.getElementById('usersTableBody').innerHTML = 
            '<tr><td colspan="8" class="loading">Error loading users</td></tr>';
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.firstName} ${user.lastName}</td>
            <td>${user.email}</td>
            <td>${user.username}</td>
            <td>${user.department || '-'}</td>
            <td>
                <span class="status-badge ${user.role === 'admin' ? 'status-active' : 'status-inactive'}">
                    ${user.role}
                </span>
            </td>
            <td>
                <span class="status-badge ${user.isActive ? 'status-active' : 'status-inactive'}">
                    ${user.isActive ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>${user.lastLogin ? formatDate(user.lastLogin) : 'Never'}</td>
            <td>
                <button onclick="editUser('${user._id}')" class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteUser('${user._id}')" class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.8rem; margin-left: 0.25rem;">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function openUserModal(userId = null) {
    const modal = document.getElementById('userModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('userForm');
    
    editingUserId = userId;
    
    if (userId) {
        // Edit mode
        modalTitle.textContent = 'Edit User';
        const user = users.find(u => u._id === userId);
        if (user) {
            populateUserForm(user);
        }
    } else {
        // Add mode
        modalTitle.textContent = 'Add New User';
        form.reset();
        // Hide password field for edit mode
        const passwordField = document.getElementById('password');
        if (passwordField) {
            passwordField.required = true;
        }
    }
    
    modal.style.display = 'block';
}

function populateUserForm(user) {
    document.getElementById('firstName').value = user.firstName || '';
    document.getElementById('lastName').value = user.lastName || '';
    document.getElementById('email').value = user.email || '';
    document.getElementById('username').value = user.username || '';
    document.getElementById('department').value = user.department || '';
    document.getElementById('role').value = user.role || 'user';
    document.getElementById('isActive').value = user.isActive ? 'true' : 'false';
    
    // Make password optional for edit mode
    const passwordField = document.getElementById('password');
    if (passwordField) {
        passwordField.required = false;
        passwordField.placeholder = 'Leave blank to keep current password';
    }
}

async function handleUserSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const userData = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        email: formData.get('email'),
        username: formData.get('username'),
        department: formData.get('department'),
        role: formData.get('role'),
        isActive: formData.get('isActive') === 'true'
    };

    // Only include password if provided
    const password = formData.get('password');
    if (password && password.trim()) {
        userData.password = password;
    }

    try {
        if (editingUserId) {
            // Update existing user
            await apiRequest(`/users/${editingUserId}`, {
                method: 'PUT',
                body: JSON.stringify(userData)
            });
            showMessage('User updated successfully', 'success');
        } else {
            // Create new user
            if (!password) {
                showMessage('Password is required for new users', 'error');
                return;
            }
            await apiRequest('/users', {
                method: 'POST',
                body: JSON.stringify(userData)
            });
            showMessage('User created successfully', 'success');
        }
        
        closeModal();
        loadUsers();
    } catch (error) {
        console.error('User operation failed:', error);
        showMessage('Operation failed: ' + error.message, 'error');
    }
}

function editUser(userId) {
    openUserModal(userId);
}

async function deleteUser(userId) {
    const user = users.find(u => u._id === userId);
    if (!user) return;

    if (confirm(`Are you sure you want to delete user "${user.firstName} ${user.lastName}"?`)) {
        try {
            await apiRequest(`/users/${userId}`, {
                method: 'DELETE'
            });
            showMessage('User deleted successfully', 'success');
            loadUsers();
        } catch (error) {
            console.error('Delete user failed:', error);
            showMessage('Failed to delete user: ' + error.message, 'error');
        }
    }
}

function closeModal() {
    const modal = document.getElementById('userModal');
    if (modal) {
        modal.style.display = 'none';
    }
    editingUserId = null;
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modal = document.getElementById('userModal');
    if (event.target === modal) {
        closeModal();
    }
});

// Export functions for global access
window.editUser = editUser;
window.deleteUser = deleteUser;
window.closeModal = closeModal;
