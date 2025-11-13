const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory data storage (for demo purposes)
let users = [];
let stockItems = [];
let transactions = [];
let nextUserId = 1;
let nextItemId = 1;
let nextTransactionId = 1;
// Simple companies master (can be replaced with SharePoint later)
const companiesMaster = [
    { code: 'ZA10', lat: -26.2041, lng: 28.0473 }, // Johannesburg
    { code: 'ZA02', lat: -33.9249, lng: 18.4241 }, // Cape Town
    { code: 'ZA03', lat: -29.8587, lng: 31.0218 }, // Durban
    { code: 'LR10', lat: 6.3153, lng: -10.8078 },   // Monrovia
    { code: 'AU01', lat: -33.8688, lng: 151.2093 }, // Sydney
    { code: 'IN01', lat: 28.6139, lng: 77.2090 },   // Delhi
    { code: 'TZ01', lat: -6.1630, lng: 39.1972 },   // Dar es Salaam (Tanzania)
    { code: 'CD11', lat: -4.3276, lng: 15.3136 },   // Kinshasa (Congo)
    { code: 'CD12', lat: -4.4411, lng: 15.2667 },   // Kinshasa alternate (Congo)
    { code: 'ML01', lat: 12.6392, lng: -8.0029 },   // Bamako (Mali)
    { code: 'ZM01', lat: -15.3875, lng: 28.3228 },  // Lusaka (Zambia)
    { code: 'BW01', lat: -24.6282, lng: 25.9231 },  // Gaborone (Botswana)
];

// Create default admin user
const createDefaultAdmin = async () => {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    users.push({
        _id: nextUserId++,
        username: 'admin',
        email: 'admin@stockcontrol.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        department: 'IT',
        role: 'admin',
        companies: ['ZA10'],
        isActive: true,
        createdAt: new Date()
    });
};

// Initialize default data
createDefaultAdmin();

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        // Allow local dev ports (5173, 5174, etc.) and no-origin (like curl)
        if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
        return callback(null, false);
    },
    credentials: true,
}));
// Accept very large uploads (big reconciliations)
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: 'your_session_secret_here',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Helper function to find user by email
const findUserByEmail = (email) => users.find(user => user.email === email);

// Helper function to find user by ID
const findUserById = (id) => users.find(user => user._id === parseInt(id));

// Helper function to find stock item by ID
const findStockItemById = (id) => stockItems.find(item => item._id === parseInt(id));

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.status(401).json({ message: 'Authentication required' });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    
    const user = findUserById(req.session.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    
    req.user = user;
    next();
};

// Routes
// Authentication routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        if (!user.isActive) {
            return res.status(401).json({ message: 'Account is deactivated' });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        req.session.userId = user._id;
        req.session.userRole = user.role;
        
        const sessionCompanies = req.session.companies || (req.session.company ? [req.session.company] : []);
        res.json({
            message: 'Login successful',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                companies: user.companies || [],
                company: sessionCompanies.length === 1 ? sessionCompanies[0] : (sessionCompanies[0] || null), // backward compat
                selectedCompanies: sessionCompanies
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Logout failed' });
        }
        res.json({ message: 'Logout successful' });
    });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = findUserById(req.session.userId);
    if (user) {
        const { password, ...userWithoutPassword } = user;
        const sessionCompanies = req.session.companies || (req.session.company ? [req.session.company] : []);
        res.json({ 
            user: { 
                ...userWithoutPassword, 
                company: sessionCompanies.length === 1 ? sessionCompanies[0] : (sessionCompanies[0] || null), // backward compat
                selectedCompanies: sessionCompanies
            } 
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
});

// User management routes (admin only)
app.get('/api/users', requireAdmin, (req, res) => {
    const usersWithoutPasswords = users.map(user => {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
    });
    res.json({ users: usersWithoutPasswords });
});

app.post('/api/users', requireAdmin, async (req, res) => {
    try {
        const { username, email, password, firstName, lastName, department, role, companies } = req.body;
        
        const existingUser = users.find(u => u.email === email || u.username === username);
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            _id: nextUserId++,
            username,
            email,
            password: hashedPassword,
            firstName,
            lastName,
            department,
            role: role || 'user',
            companies: Array.isArray(companies) ? companies : [],
            isActive: true,
            createdAt: new Date()
        };
        
        users.push(newUser);
        
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json({
            message: 'User created successfully',
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const userIndex = users.findIndex(u => u._id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const { firstName, lastName, email, department, role, isActive, companies } = req.body;
        
        if (firstName) users[userIndex].firstName = firstName;
        if (lastName) users[userIndex].lastName = lastName;
        if (email) users[userIndex].email = email;
        if (department !== undefined) users[userIndex].department = department;
        if (role) users[userIndex].role = role;
        if (isActive !== undefined) users[userIndex].isActive = isActive;
        if (companies !== undefined) users[userIndex].companies = Array.isArray(companies) ? companies : [];
        
        const { password, ...userWithoutPassword } = users[userIndex];
        res.json({
            message: 'User updated successfully',
            user: userWithoutPassword
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const userIndex = users.findIndex(u => u._id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        if (users[userIndex]._id === req.session.userId) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }
        
        users.splice(userIndex, 1);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Stock management routes
app.get('/api/stock', requireAuth, (req, res) => {
    const { page = 1, limit = 10, search = '', category = '' } = req.query;
    
    let filteredItems = stockItems.filter(item => item.isActive !== false);
    
    if (search) {
        const searchLower = search.toLowerCase();
        filteredItems = filteredItems.filter(item => 
            item.itemName.toLowerCase().includes(searchLower) ||
            item.itemCode.toLowerCase().includes(searchLower) ||
            (item.description && item.description.toLowerCase().includes(searchLower))
        );
    }
    
    if (category) {
        filteredItems = filteredItems.filter(item => item.category === category);
    }
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedItems = filteredItems.slice(startIndex, endIndex);
    
    res.json({
        stockItems: paginatedItems,
        totalPages: Math.ceil(filteredItems.length / limit),
        currentPage: parseInt(page),
        total: filteredItems.length
    });
});

app.post('/api/stock', requireAuth, (req, res) => {
    try {
        const newItem = {
            _id: nextItemId++,
            ...req.body,
            isActive: true,
            createdAt: new Date(),
            updatedBy: req.session.userId
        };
        
        stockItems.push(newItem);
        res.status(201).json({
            message: 'Stock item created successfully',
            stockItem: newItem
        });
    } catch (error) {
        console.error('Create stock item error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/stock/:id', requireAuth, (req, res) => {
    try {
        const itemId = parseInt(req.params.id);
        const itemIndex = stockItems.findIndex(item => item._id === itemId);
        
        if (itemIndex === -1) {
            return res.status(404).json({ message: 'Stock item not found' });
        }
        
        Object.assign(stockItems[itemIndex], req.body);
        stockItems[itemIndex].updatedBy = req.session.userId;
        stockItems[itemIndex].lastUpdated = new Date();
        
        res.json({
            message: 'Stock item updated successfully',
            stockItem: stockItems[itemIndex]
        });
    } catch (error) {
        console.error('Update stock item error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/stock/:id/update-stock', requireAuth, (req, res) => {
    try {
        const itemId = parseInt(req.params.id);
        const item = findStockItemById(itemId);
        
        if (!item) {
            return res.status(404).json({ message: 'Stock item not found' });
        }
        
        const { quantity, transactionType, reason, reference } = req.body;
        const previousStock = item.currentStock;
        let newStock;
        
        if (transactionType === 'in') {
            newStock = previousStock + quantity;
        } else if (transactionType === 'out') {
            newStock = previousStock - quantity;
            if (newStock < 0) {
                return res.status(400).json({ message: 'Insufficient stock' });
            }
        } else if (transactionType === 'adjustment') {
            newStock = quantity;
        }
        
        item.currentStock = newStock;
        item.updatedBy = req.session.userId;
        item.lastUpdated = new Date();
        
        const transaction = {
            _id: nextTransactionId++,
            itemId: item._id,
            transactionType,
            quantity,
            previousStock,
            newStock,
            reason,
            reference,
            performedBy: req.session.userId,
            timestamp: new Date()
        };
        
        transactions.push(transaction);
        
        res.json({
            message: 'Stock updated successfully',
            stockItem: item,
            transaction
        });
    } catch (error) {
        console.error('Update stock error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/stock/alerts/low-stock', requireAuth, (req, res) => {
    const lowStockItems = stockItems.filter(item => 
        item.isActive !== false && item.currentStock <= item.minimumStock
    );
    res.json({ lowStockItems });
});

app.get('/api/stock/categories/list', requireAuth, (req, res) => {
    const categories = [...new Set(stockItems
        .filter(item => item.isActive !== false)
        .map(item => item.category)
    )];
    res.json({ categories });
});

// Reports routes
app.get('/api/reports/stock-summary', requireAuth, (req, res) => {
    const activeItems = stockItems.filter(item => item.isActive !== false);
    const totalItems = activeItems.length;
    const totalValue = activeItems.reduce((sum, item) => sum + (item.currentStock * item.unitPrice), 0);
    const lowStockItems = activeItems.filter(item => item.currentStock <= item.minimumStock).length;
    const outOfStockItems = activeItems.filter(item => item.currentStock === 0).length;
    
    const categoryStats = activeItems.reduce((acc, item) => {
        if (!acc[item.category]) {
            acc[item.category] = { count: 0, totalValue: 0, totalStock: 0 };
        }
        acc[item.category].count++;
        acc[item.category].totalValue += item.currentStock * item.unitPrice;
        acc[item.category].totalStock += item.currentStock;
        return acc;
    }, {});
    
    const categoryStatsArray = Object.entries(categoryStats).map(([category, stats]) => ({
        _id: category,
        ...stats
    }));
    
    res.json({
        summary: {
            totalItems,
            totalValue,
            lowStockItems,
            outOfStockItems
        },
        categoryStats: categoryStatsArray
    });
});

app.get('/api/reports/recent-transactions', requireAuth, (req, res) => {
    const { limit = 20 } = req.query;
    const recentTransactions = transactions
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, parseInt(limit))
        .map(transaction => ({
            ...transaction,
            itemId: findStockItemById(transaction.itemId),
            performedBy: findUserById(transaction.performedBy)
        }));
    
    res.json({ transactions: recentTransactions });
});

app.get('/api/reports/user-activity', requireAuth, (req, res) => {
    const userActivity = users.map(user => {
        const userTransactions = transactions.filter(t => t.performedBy === user._id);
        const totalQuantityIn = userTransactions
            .filter(t => t.transactionType === 'in')
            .reduce((sum, t) => sum + t.quantity, 0);
        const totalQuantityOut = userTransactions
            .filter(t => t.transactionType === 'out')
            .reduce((sum, t) => sum + t.quantity, 0);
        const lastActivity = userTransactions.length > 0 
            ? Math.max(...userTransactions.map(t => new Date(t.timestamp)))
            : null;
        
        return {
            _id: user._id,
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            transactionCount: userTransactions.length,
            totalQuantityIn,
            totalQuantityOut,
            lastActivity: lastActivity ? new Date(lastActivity) : null
        };
    }).sort((a, b) => b.transactionCount - a.transactionCount);
    
    res.json({ userActivity });
});

app.get('/api/reports/inventory-valuation', requireAuth, (req, res) => {
    const activeItems = stockItems.filter(item => item.isActive !== false);
    const totalValue = activeItems.reduce((sum, item) => sum + (item.currentStock * item.unitPrice), 0);
    const totalQuantity = activeItems.reduce((sum, item) => sum + item.currentStock, 0);
    const averageValue = activeItems.length > 0 ? totalValue / activeItems.length : 0;
    
    const topValueItems = activeItems
        .map(item => ({
            ...item,
            totalValue: item.currentStock * item.unitPrice
        }))
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, 10);
    
    res.json({
        valuation: {
            totalItems: activeItems.length,
            totalQuantity,
            totalValue,
            averageValue
        },
        topValueItems
    });
});

// Reconciliation via JSON upload (no scanning)
// entries: [{ itemCode: string, counted: number }]

// BLANK HOOK: implement your own reconciliation logic here.
// Return an array of variance rows OR return null/undefined to use the default logic.
// Each row should be: { itemId, itemCode, itemName, book, counted, variance, missing? }
function customReconciliation(entries, stockItemsSnapshot) {
    // Write your reconciliation logic here. Examples of what you can do:
    // - Transform codes
    // - Collapse/aggregate duplicates in a custom way
    // - Apply tolerances or rules
    // - Join with external data
    // Return an array of variance rows as described above, or null to fall back to default.
    return null;
}

function defaultVariance(entries, overrideBookMap, providedNameByCode, costPriceByCode) {
    // Group entries by item code (barcode)
    const entriesByCode = new Map();
    const nameByCode = providedNameByCode ? new Map(providedNameByCode) : new Map();
    
    entries.forEach(e => {
        const code = String(e.itemCode || '').toUpperCase();
        if (!code) return;
        
        if (!entriesByCode.has(code)) {
            entriesByCode.set(code, []);
        }
        entriesByCode.get(code).push(e);
        
        const entryName = e.itemName || (e.raw && e.raw.itemName) || undefined;
        if (entryName) nameByCode.set(code, entryName);
    });
    
    // For each item, determine which count column (Count 5, 4, 3, 2, or Quantity) to use
    // Use the highest-numbered count column that has at least one value
    const quantityByCode = new Map();
    
    entriesByCode.forEach((itemEntries, code) => {
        // Find the highest count column number that has a value across ALL rows for this item
        // Then use the value from that highest count column (don't sum across rows)
        let highestCountColumn = null; // 'count5', 'count4', 'count3', 'count2', or 'quantity'
        let highestCountNumber = 0; // 5, 4, 3, 2, or 0 (for quantity)
        
        // First pass: Find the highest count column number that has any value
        itemEntries.forEach(e => {
            const raw = e.raw || {};
            
            // Check Count 5 (highest priority)
            if (raw.count5 && isValidQuantityValue(raw.count5) && highestCountNumber < 5) {
                highestCountNumber = 5;
                highestCountColumn = 'count5';
            }
            // Check Count 4
            if (raw.count4 && isValidQuantityValue(raw.count4) && highestCountNumber < 4) {
                highestCountNumber = 4;
                highestCountColumn = 'count4';
            }
            // Check Count 3
            if (raw.count3 && isValidQuantityValue(raw.count3) && highestCountNumber < 3) {
                highestCountNumber = 3;
                highestCountColumn = 'count3';
            }
            // Check Count 2
            if (raw.count2 && isValidQuantityValue(raw.count2) && highestCountNumber < 2) {
                highestCountNumber = 2;
                highestCountColumn = 'count2';
            }
            // Check Quantity (lowest priority, only if no count columns have values)
            if (raw.quantity && isValidQuantityValue(raw.quantity) && highestCountNumber === 0) {
                highestCountColumn = 'quantity';
            }
        });
        
        // Second pass: Get the value from the highest count column found
        // Use the value from the first row that has a value in that column
        let highestCountValue = 0;
        if (highestCountColumn) {
            for (const e of itemEntries) {
                const raw = e.raw || {};
                let val = null;
                
                if (highestCountColumn === 'count5') {
                    val = raw.count5;
                } else if (highestCountColumn === 'count4') {
                    val = raw.count4;
                } else if (highestCountColumn === 'count3') {
                    val = raw.count3;
                } else if (highestCountColumn === 'count2') {
                    val = raw.count2;
                } else if (highestCountColumn === 'quantity') {
                    val = raw.quantity;
                }
                
                if (val && isValidQuantityValue(val)) {
                    highestCountValue = parseCountValue(val);
                    break; // Use first valid value found
                }
            }
        } else {
            // Fallback to counted value from first entry if no count columns found
            highestCountValue = Number(itemEntries[0]?.counted || 0);
        }
        
        quantityByCode.set(code, highestCountValue);
    });
    
    // Helper function to check if a value is a valid quantity (not timestamp/ID)
    function isValidQuantityValue(val) {
        if (!val || val === '' || val === '-' || val === 'n/a') return false;
        const str = String(val).trim();
        const num = Number(String(str).replace(/[^0-9.-]/g, ''));
        if (!Number.isFinite(num)) return false;
        // Reject timestamps/IDs (10+ digits)
        if (str.match(/^\d{10,}$/)) return false;
        if (num > 1000000) return false; // Unreasonably large
        return true;
    }
    
    // Helper function to parse count value to number
    function parseCountValue(val) {
        if (!val || val === '' || val === '-' || val === 'n/a') return 0;
        const num = Number(String(val).trim().replace(/[^0-9.-]/g, ''));
        return Number.isFinite(num) ? num : 0;
    }
    
    // Collect bin locations for each item code
    const binLocationsByCode = new Map();
    let binLocationCount = 0;
    let entriesWithRaw = 0;
    let entriesWithoutRaw = 0;
    entries.forEach(e => {
        const code = String(e.itemCode || '').toUpperCase();
        if (!code) return;
        
        // Check if raw exists and has binLocation
        if (!e.raw) {
            entriesWithoutRaw++;
            if (entriesWithoutRaw <= 3) {
                console.log(`Entry missing raw object: code=${code}`);
            }
            return;
        }
        
        entriesWithRaw++;
        const binLocation = (e.raw.binLocation) ? String(e.raw.binLocation).trim() : null;
        if (!binLocation || binLocation === '' || binLocation === 'undefined') {
            if (binLocationCount < 5) {
                console.log(`Entry has raw but no binLocation: code=${code}, raw=${JSON.stringify(Object.keys(e.raw))}`);
            }
            return;
        }
        
        if (!binLocationsByCode.has(code)) {
            binLocationsByCode.set(code, new Set());
        }
        binLocationsByCode.get(code).add(binLocation);
        binLocationCount++;
        if (binLocationCount <= 5) {
            console.log(`Collecting bin location: code=${code}, bin=${binLocation}`);
        }
    });
    
    console.log(`Bin location collection: ${entries.length} total entries, ${entriesWithRaw} have raw data, ${entriesWithoutRaw} missing raw, ${binLocationCount} entries with bin locations, ${binLocationsByCode.size} unique item codes with bin locations`);
    if (binLocationsByCode.size > 0) {
        const firstCode = Array.from(binLocationsByCode.keys())[0];
        console.log(`Sample: code ${firstCode} has bin locations:`, Array.from(binLocationsByCode.get(firstCode)));
    } else {
        console.log('WARNING: No bin locations collected! Checking first entry:', entries[0] ? JSON.stringify({
            itemCode: entries[0].itemCode,
            hasRaw: !!entries[0].raw,
            rawKeys: entries[0].raw ? Object.keys(entries[0].raw) : null,
            binLocation: entries[0].raw?.binLocation
        }) : 'no entries');
    }
    
    const variances = [];
    quantityByCode.forEach((counted, code) => {
        const item = stockItems.find(i => i.itemCode?.toUpperCase() === code);
        const bookQty = overrideBookMap?.get(code) ?? (item?.currentStock || 0);
        
        // Calculate variance: Counted - Book (Count Quantity - AX Quantity)
        const variance = counted - bookQty;
        
        // Use cost price from journal (costPriceByCode) first, then fall back to item unitPrice, then 0
        const costPrice = costPriceByCode?.get(code) ?? item?.unitPrice ?? 0;
        const varianceValue = variance * costPrice;
        
        // Get bin locations for this item
        const binLocations = binLocationsByCode.has(code) 
            ? Array.from(binLocationsByCode.get(code)).sort()
            : [];
        
        // Debug: log first few items with bin locations
        if (variances.length < 5 && binLocations.length > 0) {
            console.log(`Variance item ${variances.length}: code=${code}, binLocations=${JSON.stringify(binLocations)}`);
        }
        
        if (!item) {
            const parsedName = nameByCode.get(code) || '(not found)';
            variances.push({ 
                itemId: null, 
                itemCode: code, 
                itemName: parsedName, 
                book: bookQty, 
                counted, 
                variance,
                unitPrice: costPrice,
                varianceValue,
                missing: true,
                binLocations: binLocations.length > 0 ? binLocations : []
            });
        } else {
            const mergedName = item.itemName || nameByCode.get(code) || item.itemCode;
            variances.push({ 
                itemId: item._id, 
                itemCode: item.itemCode, 
                itemName: mergedName, 
                book: bookQty, 
                counted, 
                variance,
                unitPrice: costPrice,
                varianceValue,
                binLocations: binLocations.length > 0 ? binLocations : []
            });
        }
    });
    return variances.sort((a,b) => a.itemCode.localeCompare(b.itemCode));
}

function computeVariance(entries, overrideBookMap, providedNameByCode, costPriceByCode) {
    const custom = customReconciliation(entries, stockItems);
    if (Array.isArray(custom)) return custom;
    return defaultVariance(entries, overrideBookMap, providedNameByCode, costPriceByCode);
}

app.post('/api/reconcile/preview', (req, res) => {
    const { entries = [], bookEntries = [] } = req.body || {};
    const overrideBookMap = new Map();
    const costPriceByCode = new Map();
    const nameByCode = new Map();
    
    // Debug: log what we receive
    console.log('Received bookEntries count:', bookEntries.length);
    console.log('Received entries count:', entries.length);
    if (entries.length > 0) {
        console.log('Sample entry:', {
            itemCode: entries[0].itemCode,
            hasRaw: !!entries[0].raw,
            binLocation: entries[0].raw?.binLocation
        });
    }
    if (bookEntries.length > 0) {
        console.log('Sample bookEntry:', {
            itemCode: bookEntries[0].itemCode,
            book: bookEntries[0].book,
            costPrice: bookEntries[0].costPrice
        });
    }
    
    (bookEntries || []).forEach(b => {
        const code = String(b.itemCode || '').toUpperCase();
        const qty = Number(b.book ?? b.quantity ?? b.onHand ?? b.onhand ?? b.qty ?? b.counted ?? 0);
        const costPrice = Number(b.costPrice ?? b.unitPrice ?? b.price ?? b.cost ?? 0);
        if (!code) return;
        overrideBookMap.set(code, (overrideBookMap.get(code) || 0) + qty);
        // Use first cost price found for each code
        if (costPrice > 0 && !costPriceByCode.has(code)) {
            costPriceByCode.set(code, costPrice);
        }
        if (b.itemName) nameByCode.set(code, String(b.itemName));
    });
    
    console.log('Cost prices mapped:', Array.from(costPriceByCode.entries()).slice(0, 5));
    (entries || []).forEach(e => {
        const code = String(e.itemCode || '').toUpperCase();
        if (e.itemName) nameByCode.set(code, String(e.itemName));
        else if (e.raw && e.raw.itemName) nameByCode.set(code, String(e.raw.itemName));
    });
    const variances = computeVariance(entries, overrideBookMap, nameByCode, costPriceByCode);
    res.json({ variances });
});

app.post('/api/reconcile/apply', requireAuth, (req, res) => {
    const { entries = [], bookEntries = [] } = req.body || {};
    const overrideBookMap = new Map();
    const costPriceByCode = new Map();
    const nameByCode = new Map();
    (bookEntries || []).forEach(b => {
        const code = String(b.itemCode || '').toUpperCase();
        const qty = Number(b.book ?? b.quantity ?? b.onHand ?? b.onhand ?? b.qty ?? b.counted ?? 0);
        const costPrice = Number(b.costPrice ?? b.unitPrice ?? b.price ?? b.cost ?? 0);
        if (!code) return;
        overrideBookMap.set(code, (overrideBookMap.get(code) || 0) + qty);
        // Use first cost price found for each code
        if (costPrice > 0 && !costPriceByCode.has(code)) {
            costPriceByCode.set(code, costPrice);
        }
        if (b.itemName) nameByCode.set(code, String(b.itemName));
    });
    (entries || []).forEach(e => {
        const code = String(e.itemCode || '').toUpperCase();
        if (e.itemName) nameByCode.set(code, String(e.itemName));
        else if (e.raw && e.raw.itemName) nameByCode.set(code, String(e.raw.itemName));
    });
    const variances = computeVariance(entries, overrideBookMap, nameByCode, costPriceByCode);
    variances.forEach(v => {
        if (!v.itemId) return; // skip unknown items
        const item = stockItems.find(i => i._id === v.itemId);
        const previousStock = item.currentStock;
        // Count (SharePoint) is the source of truth; set to counted
        item.currentStock = v.counted;
        item.updatedBy = req.session.userId;
        item.lastUpdated = new Date();
        transactions.push({
            _id: nextTransactionId++,
            itemId: item._id,
            transactionType: 'adjustment',
            quantity: v.counted,
            previousStock,
            newStock: v.counted,
            reason: 'Reconciliation upload',
            reference: `RECON-${Date.now()}`,
            performedBy: req.session.userId,
            timestamp: new Date()
        });
    });
    res.json({ applied: true, variances });
});

// Stock counting & reconciliation
// Create a counting session
// Load companies and warehouses data from CSV
let companiesWarehousesData = null;
function loadCompaniesWarehouses() {
    try {
        const csvPath = path.join(__dirname, '..', 'Companies and warehouses.csv');
        if (!fs.existsSync(csvPath)) {
            console.warn('Companies and warehouses.csv not found');
            return null;
        }
        const csvContent = fs.readFileSync(csvPath, 'utf8');
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) return null;
        
        // Helper to split CSV line handling quoted fields
        function splitCSVLine(line) {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        }
        
        // Skip header (line 0)
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const fields = splitCSVLine(line);
            if (fields.length >= 4) {
                const warehouse = fields[0].replace(/^"|"$/g, '');
                const company = fields[1].replace(/^"|"$/g, '');
                const financialManager = fields[2].replace(/^"|"$/g, '');
                const companyCode = fields[3].replace(/^"|"$/g, '');
                if (warehouse && company && companyCode) {
                    data.push({ warehouse, company, financialManager, companyCode });
                }
            }
        }
        console.log(`Loaded ${data.length} company/warehouse entries from CSV`);
        return data;
    } catch (error) {
        console.error('Error loading companies and warehouses:', error);
        return null;
    }
}

// Companies endpoints (no DB)
app.get('/api/companies/list', (req, res) => {
    // Load companies/warehouses data if not loaded
    if (!companiesWarehousesData) {
        companiesWarehousesData = loadCompaniesWarehouses();
    }
    
    // Use CSV data if available, otherwise fallback to companiesMaster
    if (companiesWarehousesData && companiesWarehousesData.length > 0) {
        const uniqueCompanies = [...new Map(
            companiesWarehousesData.map(item => [item.companyCode, { 
                code: item.companyCode, 
                name: item.company 
            }])
        ).values()];
        res.json({ 
            companies: uniqueCompanies.map(c => c.code),
            companiesWithNames: uniqueCompanies
        });
    } else {
        res.json({ companies: companiesMaster.map(c => c.code) });
    }
});

app.get('/api/companies/warehouses', (req, res) => {
    const companyCode = req.query.companyCode;
    if (!companyCode) {
        return res.status(400).json({ message: 'companyCode required' });
    }
    
    // Load companies/warehouses data if not loaded
    if (!companiesWarehousesData) {
        companiesWarehousesData = loadCompaniesWarehouses();
    }
    
    if (!companiesWarehousesData || companiesWarehousesData.length === 0) {
        return res.json({ warehouses: [] });
    }
    
    const warehouses = companiesWarehousesData
        .filter(item => item.companyCode.toUpperCase() === companyCode.toUpperCase())
        .map(item => item.warehouse)
        .filter((warehouse, index, self) => self.indexOf(warehouse) === index) // unique
        .sort();
    
    res.json({ warehouses });
});

app.post('/api/companies/parse-stock-take-codes', (req, res) => {
    const { csvText } = req.body;
    if (!csvText || typeof csvText !== 'string') {
        return res.status(400).json({ message: 'csvText required' });
    }
    
    // Load companies/warehouses data if not loaded
    if (!companiesWarehousesData) {
        companiesWarehousesData = loadCompaniesWarehouses();
    }
    
    // Helper to split CSV line handling quoted fields
    function splitCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }
    
    // Parse CSV
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) {
        return res.json({ options: [] });
    }
    
    // Find Stock Take Code column index
    const headers = splitCSVLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
    
    // Debug: Log all headers for troubleshooting
    console.log('[Parse Stock Take Codes] Headers found:', headers);
    console.log('[Parse Stock Take Codes] Header count:', headers.length);
    console.log('[Parse Stock Take Codes] Column E (index 4):', headers[4] || '(empty)');
    
    const stockTakeCodeIndex = headers.findIndex(h => {
        const lower = h.toLowerCase();
        return lower.includes('stock take code') || 
               lower === 'stocktakecode' ||
               lower === 'stock take code' ||
               lower.includes('stocktake') ||
               lower === 'stocktake';
    });
    
    console.log('[Parse Stock Take Codes] Stock Take Code column found at index:', stockTakeCodeIndex);
    
    if (stockTakeCodeIndex === -1) {
        // Log all headers to help debug
        console.error('[Parse Stock Take Codes] Available headers:', headers.map((h, i) => `[${i}] "${h}"`).join(', '));
        return res.status(400).json({ 
            message: `Stock Take Code column not found. Available columns: ${headers.map((h, i) => `${String.fromCharCode(65 + i)}="${h}"`).join(', ')}` 
        });
    }
    
    // Extract unique Stock Take Codes
    const uniqueCodes = new Set();
    for (let i = 1; i < lines.length; i++) {
        const cols = splitCSVLine(lines[i]);
        if (cols.length > stockTakeCodeIndex) {
            const code = cols[stockTakeCodeIndex].trim().replace(/^"|"$/g, '');
            if (code) {
                uniqueCodes.add(code);
            }
        }
    }
    
    // Parse each code: COMPANYNAMEDATEWAREHOUSE
    // Warehouse = last 4 chars (WH01)
    // Date = 8 chars before that (01092025)
    // Company = everything before the date
    const options = [];
    
    for (const code of uniqueCodes) {
        if (code.length < 13) continue; // Need at least 4 (warehouse) + 8 (date) + some company name
        
        // Extract warehouse (last 4 chars)
        const warehouse = code.slice(-4);
        
        // Extract date (8 chars before warehouse)
        if (code.length < 12) continue;
        const dateStr = code.slice(-12, -4);
        
        // Extract company name (everything before the date)
        const companyName = code.slice(0, -12);
        
        if (!companyName || !warehouse || !dateStr) continue;
        
        // Find matching company code from CSV data
        let companyCode = null;
        if (companiesWarehousesData && companiesWarehousesData.length > 0) {
            const match = companiesWarehousesData.find(item => 
                item.company.toLowerCase().trim() === companyName.toLowerCase().trim()
            );
            if (match) {
                companyCode = match.companyCode;
            }
        }
        
        // If no match found, try partial match
        if (!companyCode && companiesWarehousesData && companiesWarehousesData.length > 0) {
            const partialMatch = companiesWarehousesData.find(item => 
                companyName.toLowerCase().includes(item.company.toLowerCase()) ||
                item.company.toLowerCase().includes(companyName.toLowerCase())
            );
            if (partialMatch) {
                companyCode = partialMatch.companyCode;
            }
        }
        
        options.push({
            companyName,
            companyCode: companyCode || null,
            date: dateStr,
            warehouse,
            stockTakeCode: code
        });
    }
    
    // Remove duplicates (same companyCode + warehouse + date combination)
    const uniqueOptions = [];
    const seen = new Set();
    for (const opt of options) {
        const key = `${opt.companyCode || opt.companyName}|${opt.warehouse}|${opt.date}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueOptions.push(opt);
        }
    }
    
    // Sort by company name, then warehouse, then date
    uniqueOptions.sort((a, b) => {
        const companyA = (a.companyCode || a.companyName || '').toLowerCase();
        const companyB = (b.companyCode || b.companyName || '').toLowerCase();
        if (companyA !== companyB) return companyA.localeCompare(companyB);
        if (a.warehouse !== b.warehouse) return a.warehouse.localeCompare(b.warehouse);
        return a.date.localeCompare(b.date);
    });
    
    res.json({ options: uniqueOptions });
});

app.post('/api/companies/check', (req, res) => {
    const { company } = req.body || {};
    const valid = !!companiesMaster.find(c => c.code.toUpperCase() === String(company || '').toUpperCase());
    res.json({ valid });
});

app.post('/api/companies/select', (req, res) => {
    const { companies: companiesInput, company: companyInput, warehouse } = req.body || {};
    // Support both single company (backward compat) and array of companies
    const companiesArray = Array.isArray(companiesInput) 
        ? companiesInput 
        : companiesInput 
            ? [companiesInput] 
            : (companyInput ? [companyInput] : []);
    
    if (companiesArray.length === 0) {
        return res.status(400).json({ message: 'At least one company is required' });
    }
    
    // Load companies/warehouses data if not loaded
    if (!companiesWarehousesData) {
        companiesWarehousesData = loadCompaniesWarehouses();
    }
    
    const validCodes = [];
    const invalidCodes = [];
    
    companiesArray.forEach(code => {
        // Check against CSV data first if available
        if (companiesWarehousesData && companiesWarehousesData.length > 0) {
            const match = companiesWarehousesData.find(item => 
                item.companyCode.toUpperCase() === String(code || '').toUpperCase()
            );
            if (match) {
                validCodes.push(match.companyCode);
            } else {
                invalidCodes.push(code);
            }
        } else {
            // Fallback to companiesMaster
            const match = companiesMaster.find(c => c.code.toUpperCase() === String(code || '').toUpperCase());
            if (match) {
                validCodes.push(match.code);
            } else {
                invalidCodes.push(code);
            }
        }
    });
    
    if (invalidCodes.length > 0) {
        return res.status(400).json({ message: `Invalid companies: ${invalidCodes.join(', ')}` });
    }
    
    req.session.companies = validCodes;
    req.session.company = validCodes.length === 1 ? validCodes[0] : validCodes[0];
    if (warehouse) {
        req.session.warehouse = warehouse;
    }
    
    res.json({ companies: validCodes, warehouse: warehouse || null });
});

// Current company endpoint - public (no auth required) for Home page compatibility
app.get('/api/companies/current', (req, res) => {
    // If user is authenticated, return their session data
    if (req.session && req.session.userId) {
        const companies = req.session.companies || (req.session.company ? [req.session.company] : []);
        res.json({ 
            companies: companies,
            company: companies.length === 1 ? companies[0] : (companies[0] || null), // backward compat
            warehouse: req.session.warehouse || null
        });
    } else {
        // For public/unauthenticated access, return empty (Home page can use this)
        res.json({ 
            companies: [],
            company: null,
            warehouse: null
        });
    }
});

app.get('/api/companies/geo', requireAuth, (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return res.status(400).json({ message: 'lat/lng required' });
    // nearest company by haversine
    const toRad = d => (d * Math.PI) / 180;
    const R = 6371;
    let best = null;
    companiesMaster.forEach(c => {
        const dLat = toRad(c.lat - lat);
        const dLng = toRad(c.lng - lng);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat))*Math.cos(toRad(c.lat))*Math.sin(dLng/2)**2;
        const d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (!best || d < best.d) best = { code: c.code, d };
    });
    res.json({ company: best.code, distanceKm: Math.round(best.d) });
});

// Excel macro refresh endpoint (no auth required - Home page is public)
app.post('/api/excel/refresh', async (req, res) => {
    // Set a longer timeout for this endpoint (10 minutes)
    req.setTimeout(10 * 60 * 1000);
    res.setTimeout(10 * 60 * 1000);
    
    const startTime = Date.now();
    console.log('[Excel Refresh] Starting refresh operation at', new Date().toISOString());
    
    // Check if running on Windows (Excel COM automation is Windows-only)
    const isWindows = process.platform === 'win32';
    
    if (!isWindows) {
        console.log('[Excel Refresh] Non-Windows platform detected:', process.platform);
        return res.status(501).json({ 
            message: 'Excel refresh via macro is only available on Windows. On macOS/Linux, please upload the Excel file directly or use the file upload feature.',
            platform: process.platform,
            suggestion: 'Use the file upload button to upload your Excel file (.xlsx or .xls) instead.'
        });
    }
    
    try {
        const excelFilePath = path.join(__dirname, '..', 'RefreshExcel.xlsm');
        const outputCsvPath = path.join(__dirname, '..', 'Stock Count.csv');
        
        console.log('[Excel Refresh] Excel file path:', excelFilePath);
        console.log('[Excel Refresh] Output CSV path:', outputCsvPath);
        
        // Check if Excel file exists
        if (!fs.existsSync(excelFilePath)) {
            console.error('[Excel Refresh] Excel file not found:', excelFilePath);
            return res.status(404).json({ 
                message: 'RefreshExcel.xlsm not found. Please ensure the file exists in the root directory.' 
            });
        }
        
        console.log('[Excel Refresh] Excel file found, proceeding with macro execution...');
        
        // PowerShell script to run Excel macro
        // Try to find and execute any available macro, or use specified name
        const requestedMacroName = req.body.macroName; // Can be overridden in request
        
        // Create a temporary PowerShell script file to avoid escaping issues
        const tempScriptPath = path.join(__dirname, '..', 'temp_refresh_excel.ps1');
        const powershellScript = `$excelPath = "${excelFilePath.replace(/\\/g, '\\\\')}"
$outputPath = "${outputCsvPath.replace(/\\/g, '\\\\')}"
$requestedMacro = "${requestedMacroName || ''}"

try {
    Write-Host "[Step 1/6] Creating Excel COM object..."
    # Create Excel COM object
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    
    Write-Host "[Step 2/6] Opening workbook: $excelPath"
    # Open the workbook
    $workbook = $excel.Workbooks.Open($excelPath)
    Write-Host "[Step 2/6] Workbook opened successfully"
    
    # Note: The macro may include Application.Quit at the end
    # We'll handle that by checking if Excel is still accessible after macro execution
    
    Write-Host "[Step 3/6] Searching for macros..."
    # Try to get macro names (may fail due to security settings)
    $foundMacros = @()
    try {
        $vbProject = $workbook.VBProject
        foreach ($component in $vbProject.VBComponents) {
            $codeModule = $component.CodeModule
            if ($codeModule.CountOfLines -gt 0) {
                $content = $codeModule.Lines(1, $codeModule.CountOfLines)
                # Extract Sub and Function names (case-insensitive)
                $matches = [regex]::Matches($content, '(?i)(?:Sub|Function)\s+(\w+)\s*\(')
                foreach ($match in $matches) {
                    $foundMacros += $match.Groups[1].Value
                }
            }
        }
        Write-Host "Found macros: $($foundMacros -join ', ')"
    } catch {
        Write-Host "Note: Could not enumerate macros (may need 'Trust access to VBA project' enabled). Will try common names."
    }
    
    $macroToRun = $null
    $lastError = ""
    
    # If specific macro requested, try that first
    if ($requestedMacro -and $requestedMacro.Trim() -ne '') {
        try {
            $excel.Run($requestedMacro)
            Write-Host "Macro '$requestedMacro' executed successfully"
            $macroToRun = $requestedMacro
        } catch {
            $lastError = "Requested macro '$requestedMacro': $($_.Exception.Message)"
            Write-Host $lastError
        }
    }
    
    # If no macro found yet, try common names (starting with RefreshAllData which is the known macro name)
    if (-not $macroToRun) {
        $commonNames = @('RefreshAllData', 'RefreshData', 'RefreshAll', 'Refresh', 'Main', 'AutoRefresh', 'RefreshExcel', 'RefreshDataConnection', 'RefreshConnections', 'UpdateData')
        foreach ($name in $commonNames) {
            try {
                $excel.Run($name)
                Write-Host "Macro '$name' executed successfully"
                $macroToRun = $name
                break
            } catch {
                $lastError = "Macro '$name': $($_.Exception.Message)"
                continue
            }
        }
    }
    
    # If still no macro and we found macros via enumeration, try the first one
    if (-not $macroToRun -and $foundMacros.Count -gt 0) {
        $firstMacro = $foundMacros[0]
        try {
            $excel.Run($firstMacro)
            Write-Host "Executed first available macro: $firstMacro"
            $macroToRun = $firstMacro
        } catch {
            $lastError = "Failed to execute '$firstMacro': $($_.Exception.Message)"
        }
    }
    
    if (-not $macroToRun) {
        $errorMsg = "No executable macro found. "
        if ($foundMacros.Count -gt 0) {
            $errorMsg += "Found macros: $($foundMacros -join ', '). "
        }
        $errorMsg += "Tried common names: RefreshAllData, RefreshData, RefreshAll, Refresh, Main, AutoRefresh, RefreshExcel. "
        $errorMsg += "Last error: $lastError"
        throw $errorMsg
    }
    
    Write-Host "[Step 4/6] Executing macro: $macroToRun"
    Write-Host "[Step 4/6] Waiting for data to refresh (this may take several minutes)..."
    
    # Give Excel a moment to start processing after macro execution
    Write-Host "[Step 4/6] Waiting 5 seconds for macro to start processing..."
    Start-Sleep -Seconds 5
    
    $maxWaitTime = 180  # Maximum wait time in seconds (3 minutes - increased from 2)
    $checkInterval = 5  # Check every 5 seconds (increased from 2 to reduce overhead)
    $waited = 5  # Start at 5 since we already waited
    $dataReady = $false
    
    # Get the "Stock Take Data" worksheet (or fallback to active sheet)
    $worksheet = $null
    try {
        $worksheet = $workbook.Worksheets.Item("Stock Take Data")
    } catch {
        Write-Host "Worksheet 'Stock Take Data' not found, trying active sheet..."
        try {
            $worksheet = $workbook.ActiveSheet
        } catch {
            $worksheet = $workbook.Worksheets.Item(1)
        }
    }
    
    if (-not $worksheet) {
        throw "Could not find worksheet 'Stock Take Data' or any other worksheet"
    }
    
    Write-Host "Using worksheet: $($worksheet.Name)"
    
    while ($waited -lt $maxWaitTime -and -not $dataReady) {
        Start-Sleep -Seconds $checkInterval
        $waited += $checkInterval
        
        # Log progress every 10 seconds
        if ($waited % 10 -eq 0) {
            Write-Host "[Step 4/6] Still waiting for data... ($waited / $maxWaitTime seconds)"
        }
        
        # Check if Excel is ready (not calculating or refreshing)
        $excelReady = $false
        try {
            $calcState = $excel.CalculationState
            if ($calcState -eq 0) {  # xlDone = 0
                $excelReady = $true
            }
        } catch {
            # If we can't check calculation state, assume Excel might be busy
            $excelReady = $false
        }
        
        # Only check cells if Excel appears ready
        if ($excelReady) {
            try {
                # Check if row 2 (first data row, row 1 is headers) has data
                # Check more columns to ensure we catch all data
                $hasData = $false
                for ($col = 1; $col -le 20; $col++) {
                    try {
                        $cellValue = $worksheet.Cells.Item(2, $col).Value2
                        if ($cellValue -and $cellValue.ToString().Trim() -ne '') {
                            $hasData = $true
                            Write-Host "[Step 4/6] Data detected in row 2 (first data row), column $col"
                            break
                        }
                    } catch {
                        # Cell access failed, Excel might still be busy - continue
                        continue
                    }
                }
                
                if ($hasData) {
                    $dataReady = $true
                    Write-Host "[Step 4/6] Data detected in row 2 after $waited seconds"
                } else {
                    if ($waited % 10 -eq 0) {
                        Write-Host "[Step 4/6] Waiting for data in row 2... ($waited / $maxWaitTime seconds)"
                    }
                }
            } catch {
                # COM error - Excel is busy, just wait and try again
                if ($waited % 10 -eq 0) {
                    Write-Host "[Step 4/6] Excel busy, waiting... ($waited / $maxWaitTime seconds)"
                }
            }
        } else {
            if ($waited % 10 -eq 0) {
                Write-Host "[Step 4/6] Excel calculating/refreshing, waiting... ($waited / $maxWaitTime seconds)"
            }
        }
    }
    
    if (-not $dataReady) {
        Write-Host "[Step 4/6] Warning: Timeout reached waiting for data in row 2 (first data row). Proceeding anyway to attempt reading..."
    } else {
        Write-Host "[Step 4/6] Data ready check completed successfully"
    }
    
    # Wait for Excel to finish all calculations before reading (with timeout)
    Write-Host "[Step 4/6] Ensuring Excel calculations are complete before reading..."
    $calcComplete = $false
    $calcWaitTime = 0
    $maxCalcWait = 60
    $calcCheckInterval = 5
    
    while (-not $calcComplete -and $calcWaitTime -lt $maxCalcWait) {
        try {
            $calcState = $excel.CalculationState
            if ($calcState -eq 0) {
                Start-Sleep -Seconds 3
                $calcState2 = $excel.CalculationState
                if ($calcState2 -eq 0) {
                    $calcComplete = $true
                    Write-Host "[Step 4/6] Excel calculations complete"
                } else {
                    Write-Host "[Step 4/6] Excel calculation state changed, still waiting..."
                }
            } else {
                Write-Host "[Step 4/6] Excel still calculating (state: $calcState), waiting... ($calcWaitTime / $maxCalcWait seconds)"
                Start-Sleep -Seconds $calcCheckInterval
                $calcWaitTime += $calcCheckInterval
            }
        } catch {
            Write-Host "[Step 4/6] Cannot check calculation state, waiting... ($calcWaitTime / $maxCalcWait seconds)"
            Start-Sleep -Seconds $calcCheckInterval
            $calcWaitTime += $calcCheckInterval
            if ($calcWaitTime -ge $maxCalcWait) {
                Write-Host "[Step 4/6] Calculation check timeout, proceeding anyway..."
                $calcComplete = $true
            }
        }
    }
    
    if (-not $calcComplete) {
        Write-Host "[Step 4/6] Warning: Excel may still be calculating, but proceeding with data read after $maxCalcWait seconds..."
    }
    
    # Read data directly from Excel sheet before closing
    Write-Host "[Step 5/6] Reading data from Excel sheet..."
    $csvLines = @()
    
    try {
        # Ensure we're using the correct worksheet
        if ($worksheet.Name -ne "Stock Take Data") {
            try {
                $worksheet = $workbook.Worksheets.Item("Stock Take Data")
                Write-Host "Switched to worksheet: $($worksheet.Name)"
            } catch {
                Write-Host "Warning: Could not switch to 'Stock Take Data', using current worksheet: $($worksheet.Name)"
            }
        }
        
        # Find the last row with data - use a safer method
        $lastRow = 0
        try {
            $lastRow = $worksheet.UsedRange.Rows.Count
            Write-Host "[Step 5/6] UsedRange reports $lastRow rows"
        } catch {
            Write-Host "[Step 5/6] UsedRange failed, trying alternative method..."
        }
        
        if ($lastRow -eq 0) {
            # Try alternative method - find last row in column 1
            try {
                $lastRow = $worksheet.Cells($worksheet.Rows.Count, 1).End(-4162).Row  # xlUp = -4162
                Write-Host "[Step 5/6] Alternative method found $lastRow rows"
            } catch {
                Write-Host "[Step 5/6] Alternative method failed, using fallback of 1000 rows"
                $lastRow = 1000
            }
        }
        
        if ($lastRow -eq 0) { 
            Write-Host "[Step 5/6] Could not determine last row, using fallback of 1000 rows"
            $lastRow = 1000 
        }
        
        Write-Host "[Step 5/6] Reading rows 1 to $lastRow from worksheet '$($worksheet.Name)' using bulk range reading..."
        
        # Optimized: Read data in bulk ranges instead of cell-by-cell
        # This is MUCH faster - read entire ranges at once
        $maxColumns = 50  # Maximum columns to read
        $batchSize = 500  # Read 500 rows at a time (can adjust based on performance)
        $emptyRowCount = 0
        $maxEmptyRows = 10
        
        # Helper function to escape CSV values
        function Escape-CsvValue {
            param([string]$value)
            if ($null -eq $value -or $value -eq '') { return '' }
            $str = $value.ToString()
            if ($str -match '[,"\r\n]') {
                $str = $str -replace '"', '""'
                return '"' + $str + '"'
            }
            return $str
        }
        
        # Read data in batches
        $currentRow = 1
        while ($currentRow -le $lastRow) {
            $batchEndRow = [Math]::Min($currentRow + $batchSize - 1, $lastRow)
            $rowsInBatch = $batchEndRow - $currentRow + 1
            
            try {
                # Read entire range at once - this is MUCH faster than cell-by-cell
                $startCol = 1
                $endCol = $maxColumns
                $rangeAddress = $worksheet.Cells.Item($currentRow, $startCol).Address($false, $false) + ":" + $worksheet.Cells.Item($batchEndRow, $endCol).Address($false, $false)
                
                Write-Host "[Step 5/6] Reading batch: rows $currentRow to $batchEndRow (range: $rangeAddress)..."
                
                $range = $worksheet.Range($rangeAddress)
                $batchValues = $range.Value2  # Get entire 2D array in one call
                
                # Debug: Check array dimensions
                if ($currentRow -eq 1) {
                    Write-Host "[Step 5/6] Debug: Array type: $($batchValues.GetType().Name)"
                    Write-Host "[Step 5/6] Debug: Array dimensions: $($batchValues.Rank)"
                    if ($batchValues.Rank -eq 2) {
                        Write-Host "[Step 5/6] Debug: Array size: [$($batchValues.GetLength(0)), $($batchValues.GetLength(1))]"
                    }
                }
                
                # Process the batch
                for ($batchRow = 0; $batchRow -lt $rowsInBatch; $batchRow++) {
                    $actualRow = $currentRow + $batchRow
                    $rowData = @()
                    $hasData = $false
                    
                    # Process columns in this row
                    for ($batchCol = 0; $batchCol -lt $maxColumns; $batchCol++) {
                        try {
                            # Access 2D array: Excel COM returns 1-based arrays
                            # First index is row (1 to rowsInBatch), second is column (1 to maxColumns)
                            $rowIdx = $batchRow + 1
                            $colIdx = $batchCol + 1
                            
                            # Handle different array structures
                            if ($batchValues.Rank -eq 2) {
                                $cellValue = $batchValues[$rowIdx, $colIdx]
                            } elseif ($batchValues -is [System.Array]) {
                                # Try as 1D array (unlikely but possible)
                                $cellValue = $batchValues[($batchRow * $maxColumns) + $batchCol]
                            } else {
                                # Single value case
                                if ($batchRow -eq 0 -and $batchCol -eq 0) {
                                    $cellValue = $batchValues
                                } else {
                                    $cellValue = $null
                                }
                            }
                            
                            if ($null -ne $cellValue -and $cellValue.ToString().Trim() -ne '') {
                                $hasData = $true
                                $rowData += (Escape-CsvValue $cellValue)
                            } else {
                                $rowData += ""
                            }
                        } catch {
                            # Column might be out of bounds, add empty
                            $rowData += ""
                        }
                    }
                    
                    # Add row if it has data, or if it's row 1 (headers)
                    if ($hasData -or $actualRow -eq 1) {
                        $csvLines += ($rowData -join ",")
                        $emptyRowCount = 0
                    } else {
                        $emptyRowCount++
                        if ($emptyRowCount -ge $maxEmptyRows) {
                            Write-Host "[Step 5/6] Stopped reading after $maxEmptyRows consecutive empty rows (at row $actualRow)"
                            $currentRow = $lastRow + 1  # Break out of outer loop
                            break
                        }
                    }
                }
                
                # Progress update after each batch
                Write-Host "[Step 5/6] Batch complete: processed rows $currentRow to $batchEndRow, total CSV lines: $($csvLines.Count)"
                
                $currentRow = $batchEndRow + 1
                
                # Small delay between batches to prevent overwhelming Excel
                if ($currentRow -le $lastRow) {
                    Start-Sleep -Milliseconds 100
                }
                
            } catch {
                $errorMsg = $_.Exception.Message
                Write-Host "[Step 5/6] Error reading batch (rows $currentRow to $batchEndRow): $errorMsg"
                
                # If batch fails, fall back to reading individual rows for this batch
                Write-Host "[Step 5/6] Falling back to row-by-row reading for this batch..."
                for ($row = $currentRow; $row -le $batchEndRow -and $row -le $lastRow; $row++) {
                    $rowData = @()
                    $hasData = $false
                    for ($col = 1; $col -le $maxColumns; $col++) {
                        try {
                            $cellValue = $worksheet.Cells.Item($row, $col).Value2
                            if ($null -ne $cellValue -and $cellValue.ToString().Trim() -ne '') {
                                $hasData = $true
                                $rowData += (Escape-CsvValue $cellValue)
                            } else {
                                $rowData += ""
                            }
                        } catch {
                            break
                        }
                    }
                    if ($hasData -or $row -eq 1) {
                        $csvLines += ($rowData -join ",")
                        $emptyRowCount = 0
                    } else {
                        $emptyRowCount++
                        if ($emptyRowCount -ge $maxEmptyRows) {
                            $currentRow = $lastRow + 1
                            break
                        }
                    }
                }
                $currentRow = $batchEndRow + 1
            }
        }
        
        Write-Host "[Step 5/6] Read $($csvLines.Count) rows from Excel (scanned up to row $currentRow of $lastRow)"
        
    } catch {
        Write-Host "Error reading Excel data: $($_.Exception.Message)"
        throw "Failed to read data from Excel: $($_.Exception.Message)"
    }
    
    Write-Host "[Step 6/6] Processing CSV and closing Excel..."
    # Convert to CSV string
    $csvContent = $csvLines -join [Environment]::NewLine
    
    # Save the workbook (macro refreshed data, we save it)
    Write-Host "[Step 6/6] Saving workbook..."
    $workbook.Save()
    
    # Close Excel
    Write-Host "[Step 6/6] Closing Excel..."
    $workbook.Close($false)
    $excel.Quit()
    
    # Release COM objects if they exist
    try {
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($worksheet) | Out-Null
    } catch {}
    try {
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook) | Out-Null
    } catch {}
    try {
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    } catch {}
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    
    Write-Host "SUCCESS"
    Write-Host "CSV_CONTENT_START"
    # Output CSV content directly to stdout (not Write-Host which may truncate)
    # Split by newlines and write each line to ensure proper output
    $newline = [Environment]::NewLine
    $csvLinesArray = $csvContent -split $newline
    $lineCount = $csvLinesArray.Count
    # Send debug info to stderr, not stdout
    [Console]::Error.WriteLine("[Output] Writing $lineCount CSV lines to output...")
    [Console]::Error.WriteLine("[Output] First 3 lines preview:")
    for ($i = 0; $i -lt [Math]::Min(3, $csvLinesArray.Length); $i++) {
        $preview = $csvLinesArray[$i].Substring(0, [Math]::Min(100, $csvLinesArray[$i].Length))
        [Console]::Error.WriteLine("[Output] Line $($i+1): $preview")
    }
    # Output ONLY the actual CSV lines to stdout (between markers)
    foreach ($line in $csvLinesArray) {
        [Console]::Out.WriteLine($line)
    }
    Write-Host "CSV_CONTENT_END"
} catch {
    $errorMsg = $_.Exception.Message
    Write-Host "ERROR: $errorMsg"
    exit 1
}`;
        
        // Write script to temp file
        console.log('[Excel Refresh] Writing PowerShell script to:', tempScriptPath);
        fs.writeFileSync(tempScriptPath, powershellScript, 'utf8');
        console.log('[Excel Refresh] PowerShell script written, size:', powershellScript.length, 'bytes');
        
        try {
            // Execute PowerShell script with increased timeout and buffer
            // Excel operations can take several minutes, so we need a long timeout
            const timeoutMs = 10 * 60 * 1000; // 10 minutes timeout
            console.log('[Excel Refresh] Starting PowerShell execution with', timeoutMs / 1000, 'second timeout');
            const execStartTime = Date.now();
            
            // Use spawn instead of exec to get real-time output
            const { spawn } = require('child_process');
            let accumulatedStdout = '';
            let accumulatedStderr = '';
            
            const powershellProcess = spawn('powershell.exe', [
                '-ExecutionPolicy', 'Bypass',
                '-File', tempScriptPath
            ], {
                maxBuffer: 1024 * 1024 * 50,
                timeout: timeoutMs
            });
            
            // Capture output in real-time
            powershellProcess.stdout.on('data', (data) => {
                const output = data.toString();
                accumulatedStdout += output;
                // Log important steps immediately (but filter out CSV content)
                if (output.includes('[Step') || output.includes('SUCCESS') || output.includes('ERROR')) {
                    // Only log if it's not CSV content
                    if (!output.includes('CSV_CONTENT_START') && !output.includes('CSV_CONTENT_END') && 
                        !output.match(/^[^,\r\n]*,[^,\r\n]*,/)) { // Not a CSV line pattern
                        console.log('[Excel Refresh] PowerShell:', output.trim());
                    }
                }
            });
            
            powershellProcess.stderr.on('data', (data) => {
                const stderrOutput = data.toString();
                accumulatedStderr += stderrOutput;
                // Log stderr output (debug messages)
                if (stderrOutput.includes('[Output]') || stderrOutput.includes('[Step')) {
                    console.log('[Excel Refresh] PowerShell (stderr):', stderrOutput.trim());
                }
            });
            
            const execPromise = new Promise((resolve, reject) => {
                powershellProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve({ stdout: accumulatedStdout, stderr: accumulatedStderr });
                    } else {
                        reject(new Error(`PowerShell exited with code ${code}. Stderr: ${accumulatedStderr}`));
                    }
                });
                
                powershellProcess.on('error', (error) => {
                    reject(error);
                });
            });
            
            // Log progress every 30 seconds
            const progressInterval = setInterval(() => {
                const elapsed = Math.round((Date.now() - execStartTime) / 1000);
                console.log(`[Excel Refresh] Still running... (${elapsed}s elapsed)`);
                // Try to get last few lines of output for debugging
                const lastLines = accumulatedStdout.split('\n').slice(-5).join('\n');
                if (lastLines.trim()) {
                    console.log('[Excel Refresh] Last PowerShell output:', lastLines.trim());
                }
            }, 30000); // Every 30 seconds
            
            // Add additional timeout wrapper in case exec timeout doesn't work
            let timeoutReached = false;
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    timeoutReached = true;
                    clearInterval(progressInterval);
                    console.log('[Excel Refresh] Timeout reached, killing PowerShell process...');
                    powershellProcess.kill();
                    reject(new Error('Excel refresh operation timed out after 10 minutes'));
                }, timeoutMs);
            });
            
            let result;
            try {
                result = await Promise.race([execPromise, timeoutPromise]);
                clearInterval(progressInterval);
            } catch (error) {
                clearInterval(progressInterval);
                if (timeoutReached) {
                    console.error('[Excel Refresh] Process was killed due to timeout');
                }
                throw error;
            }
            
            const { stdout, stderr } = result;
            
            const execDuration = Math.round((Date.now() - execStartTime) / 1000);
            console.log(`[Excel Refresh] PowerShell execution completed in ${execDuration} seconds`);
        
            // Log output for debugging (truncated if too long)
            const outputPreview = stdout.length > 1000 ? stdout.substring(0, 1000) + '...' : stdout;
            console.log('[Excel Refresh] PowerShell output length:', stdout.length);
            console.log('[Excel Refresh] Output preview:', outputPreview);
            
            if (stderr && !stdout.includes('SUCCESS')) {
                console.error('[Excel Refresh] PowerShell error:', stderr);
                console.error('[Excel Refresh] Full stdout:', stdout);
                return res.status(500).json({ 
                    message: `Failed to execute macro: ${stderr || 'Unknown error'}` 
                });
            }
            
            // Check if SUCCESS marker is present
            if (!stdout.includes('SUCCESS')) {
                console.error('[Excel Refresh] SUCCESS marker not found in output');
                console.error('[Excel Refresh] Full stdout:', stdout.substring(0, 5000));
                return res.status(500).json({ 
                    message: 'Excel refresh did not complete successfully. Check server logs for details.' 
                });
            }
            
            // Extract CSV content from PowerShell output (between markers)
            const csvStartMarker = 'CSV_CONTENT_START';
            const csvEndMarker = 'CSV_CONTENT_END';
            const startIndex = stdout.indexOf(csvStartMarker);
            const endIndex = stdout.indexOf(csvEndMarker);
            
            console.log('[Excel Refresh] CSV marker positions:', { startIndex, endIndex });
            
            let csvContent = '';
            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                // Extract content between markers
                const rawContent = stdout.substring(startIndex + csvStartMarker.length, endIndex);
                csvContent = rawContent.trim();
                console.log('[Excel Refresh] Extracted CSV content length:', csvContent.length);
            } else {
                // Fallback: try to read from file if markers not found
                console.warn('[Excel Refresh] CSV markers not found in output, trying to read from file...');
                console.warn('[Excel Refresh] Marker search result:', { 
                    startIndex, 
                    endIndex, 
                    hasStart: stdout.includes(csvStartMarker),
                    hasEnd: stdout.includes(csvEndMarker),
                    stdoutLength: stdout.length
                });
                if (fs.existsSync(outputCsvPath)) {
                    csvContent = fs.readFileSync(outputCsvPath, 'utf8');
                    console.log('[Excel Refresh] Read CSV from file, length:', csvContent.length);
                } else {
                    console.error('[Excel Refresh] File not found:', outputCsvPath);
                    return res.status(500).json({ 
                        message: 'Failed to extract CSV data. Macro may have executed but data could not be read. Check server logs for details.' 
                    });
                }
            }
            
            if (!csvContent || csvContent.trim().length === 0) {
                console.error('[Excel Refresh] CSV content is empty after extraction');
                return res.status(500).json({ 
                    message: 'No data found in Excel sheet. Please check that the macro refreshed the data correctly.' 
                });
            }
            
            console.log('[Excel Refresh] Successfully extracted CSV, first 200 chars:', csvContent.substring(0, 200));
            
            const totalDuration = Math.round((Date.now() - startTime) / 1000);
            console.log(`[Excel Refresh] Total operation completed in ${totalDuration} seconds`);
            console.log('[Excel Refresh] CSV content length:', csvContent.length, 'characters');
            console.log('[Excel Refresh] CSV line count (approx):', csvContent.split('\n').length);
            
            res.json({ 
                success: true,
                message: 'Excel macro executed successfully',
                csvContent: csvContent,
                fileName: 'Stock Count.csv'
            });
        } finally {
            // Clean up temp script file
            try {
                if (fs.existsSync(tempScriptPath)) {
                    fs.unlinkSync(tempScriptPath);
                }
            } catch (cleanupError) {
                console.warn('Failed to cleanup temp script:', cleanupError);
            }
        }
        
    } catch (error) {
        console.error('Excel refresh error:', error);
        res.status(500).json({ 
            message: `Failed to refresh Excel: ${error.message}` 
        });
    }
});


// Serve React app (frontend handles routing)
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

// Catch all routes and serve React app (for client-side routing)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Default admin credentials:`);
    console.log(`Email: admin@stockcontrol.com`);
    console.log(`Password: admin123`);
    console.log(`Access the app at: http://localhost:${PORT}`);
});
