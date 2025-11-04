# Stock Control App

A comprehensive web application for managing inventory, stock levels, and user accounts with role-based access control.

## Features

### 🏠 Home Dashboard
- User authentication and session management
- Quick stats overview (total items, low stock alerts, total value)
- Navigation to all major sections
- Role-based access control (admin vs regular users)

### 👥 User Management (Admin Only)
- Create, read, update, and delete user accounts
- Role assignment (admin/user)
- User status management (active/inactive)
- Department assignment
- User activity tracking

### 📦 Stock Control
- Complete inventory management
- Add, edit, and delete stock items
- Real-time stock level updates
- Stock movement tracking (in/out/adjustments)
- Low stock alerts
- Category-based organization
- Search and filter functionality
- Pagination for large datasets

### 📊 Reports & Analytics
- Stock summary with visual charts
- Recent transaction history
- Stock movement reports with date filtering
- User activity reports
- Inventory valuation analysis
- Top value items tracking
- Export functionality

## Technology Stack

- **Backend**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Frontend**: Vanilla JavaScript with modern ES6+
- **Styling**: Custom CSS with responsive design
- **Authentication**: Session-based with bcrypt password hashing
- **Charts**: Chart.js for data visualization

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn package manager

## Installation

1. **Clone or download the project**
   ```bash
   cd "Stock Control App"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `config.env` and update the values:
   ```env
   MONGODB_URI=mongodb://localhost:27017/stockcontrol
   JWT_SECRET=your_jwt_secret_key_here
   SESSION_SECRET=your_session_secret_here
   PORT=3000
   ```

4. **Start MongoDB**
   - Make sure MongoDB is running on your system
   - Default connection: `mongodb://localhost:27017`

5. **Start the application**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Or production mode
   npm start
   ```

6. **Access the application**
   - Open your browser and go to `http://localhost:3000`

## Default Admin Account

The application doesn't create a default admin account automatically. To create an admin user:

1. Start the application
2. Go to the registration endpoint or create a user through the API
3. Update the user's role to 'admin' in the database

Alternatively, you can create an admin user by making a POST request to `/api/users` with admin role.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user info

### Users (Admin Only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Stock Management
- `GET /api/stock` - Get stock items (with pagination and filters)
- `GET /api/stock/:id` - Get stock item by ID
- `POST /api/stock` - Create new stock item
- `PUT /api/stock/:id` - Update stock item
- `POST /api/stock/:id/update-stock` - Update stock quantity
- `GET /api/stock/alerts/low-stock` - Get low stock items
- `GET /api/stock/categories/list` - Get all categories

### Reports
- `GET /api/reports/stock-summary` - Get stock summary
- `GET /api/reports/recent-transactions` - Get recent transactions
- `GET /api/reports/stock-movement` - Get stock movement report
- `GET /api/reports/user-activity` - Get user activity report
- `GET /api/reports/inventory-valuation` - Get inventory valuation

## Project Structure

```
Stock Control App/
├── server.js                 # Main server file
├── package.json             # Dependencies and scripts
├── config.env               # Environment variables
├── models/                  # Database models
│   ├── User.js             # User schema
│   ├── StockItem.js        # Stock item schema
│   └── StockTransaction.js # Transaction schema
├── routes/                  # API routes
│   ├── auth.js             # Authentication routes
│   ├── users.js            # User management routes
│   ├── stock.js            # Stock management routes
│   └── reports.js          # Reports routes
├── middleware/              # Custom middleware
│   └── auth.js             # Authentication middleware
└── public/                  # Frontend files
    ├── index.html          # Home page
    ├── admin.html          # User management page
    ├── stock.html          # Stock control page
    ├── reports.html        # Reports page
    ├── styles.css          # Main stylesheet
    ├── app.js              # Main JavaScript
    ├── admin.js            # Admin page logic
    ├── stock.js            # Stock page logic
    └── reports.js          # Reports page logic
```

## Usage Guide

### Getting Started
1. **Login**: Use the login form on the home page
2. **Navigation**: Use the dashboard cards to navigate between sections
3. **Admin Access**: Only users with admin role can access user management

### Managing Stock
1. **Add Items**: Click "Add New Item" to create inventory entries
2. **Update Stock**: Use the edit button to modify stock levels
3. **Track Movements**: All stock changes are logged with timestamps
4. **Search & Filter**: Use the search bar and category filter to find items

### Viewing Reports
1. **Summary**: View overall inventory statistics
2. **Charts**: Visual representation of data by category
3. **Transactions**: Detailed transaction history
4. **Export**: Download reports as CSV files

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- Role-based access control
- Input validation and sanitization
- CSRF protection through sessions
- SQL injection prevention with Mongoose

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge
- Mobile responsive design

## Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check the connection string in `config.env`

2. **Port Already in Use**
   - Change the PORT in `config.env`
   - Or stop the process using the port

3. **Session Issues**
   - Clear browser cookies
   - Check session secret in `config.env`

4. **Permission Errors**
   - Ensure proper file permissions
   - Check MongoDB user permissions

### Development Tips

- Use `npm run dev` for development with auto-restart
- Check browser console for JavaScript errors
- Monitor server logs for backend issues
- Use MongoDB Compass for database inspection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support or questions, please check the troubleshooting section or create an issue in the repository.
