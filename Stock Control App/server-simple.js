const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const axios = require('axios');

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

app.post('/api/reconcile/preview', requireAuth, (req, res) => {
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
    const stockTakeCodeIndex = headers.findIndex(h => 
        h.toLowerCase().includes('stock take code') || 
        h.toLowerCase() === 'stocktakecode' ||
        h.toLowerCase() === 'stock take code'
    );
    
    if (stockTakeCodeIndex === -1) {
        return res.status(400).json({ message: 'Stock Take Code column not found' });
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

app.post('/api/companies/select', requireAuth, (req, res) => {
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

app.get('/api/companies/current', requireAuth, (req, res) => {
    // Support both arrays and single company (backward compat)
    const companies = req.session.companies || (req.session.company ? [req.session.company] : []);
    res.json({ 
        companies: companies,
        company: companies.length === 1 ? companies[0] : (companies[0] || null), // backward compat
        warehouse: req.session.warehouse || null
    });
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
