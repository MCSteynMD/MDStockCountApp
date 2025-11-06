# Stock Control App - Comprehensive Testing Plan

## Overview
This testing plan ensures the application is bulletproof for inexperienced users. Test all scenarios systematically before deployment.

---

## 1. Excel Refresh Functionality

### 1.1 Basic Excel Refresh
- [ ] **Test**: Click "Refresh Excel" button on Home page
- [ ] **Expected**: 
  - Button shows "Refreshing..." state
  - Progress messages appear (Opening Excel, Running macro, etc.)
  - Success message appears after completion
  - Company/Warehouse dropdowns become visible and populated
  - Date dropdown appears with available dates
- [ ] **Edge Cases**:
  - Excel file is open in another application
  - Excel file is locked/read-only
  - Excel file doesn't exist
  - Excel macro fails to execute
  - Excel takes longer than 10 minutes to refresh

### 1.2 Excel Refresh with Large Datasets
- [ ] **Test**: Refresh Excel with 10,000+ rows
- [ ] **Expected**:
  - Process completes without timeout
  - All data is extracted correctly
  - CSV content is properly formatted
  - No memory errors or crashes
- [ ] **Performance**: Should complete in under 2 minutes for 10K rows

### 1.3 Excel Refresh Error Handling
- [ ] **Test**: Excel file missing
- [ ] **Expected**: Clear error message, no crash
- [ ] **Test**: Macro not found
- [ ] **Expected**: Error message explaining macro issue
- [ ] **Test**: Excel COM object fails
- [ ] **Expected**: Graceful error handling, user-friendly message

---

## 2. File Upload Functionality

### 2.1 CSV File Upload (Home Page)
- [ ] **Test**: Upload valid CSV file via "Upload File" button
- [ ] **Expected**:
  - File is accepted
  - Success message appears
  - Company/Warehouse dropdowns populate
  - Date dropdown appears
- [ ] **Test**: Upload invalid CSV (wrong format)
- [ ] **Expected**: Clear error message, no crash
- [ ] **Test**: Upload very large file (>10MB)
- [ ] **Expected**: Handles gracefully or shows appropriate message

### 2.2 File Upload (Reconcile Page)
- [ ] **Test**: Upload Journal CSV file
- [ ] **Expected**: Success message appears, file is processed
- [ ] **Test**: Upload Counts CSV file
- [ ] **Expected**: Success message appears, file is processed
- [ ] **Test**: Upload both files
- [ ] **Expected**: Both show success messages independently

### 2.3 File Upload (Summary Page)
- [ ] **Test**: Upload Journal CSV in collapsed upload section
- [ ] **Expected**: Success message appears
- [ ] **Test**: Upload Counts CSV
- [ ] **Expected**: Success message appears

---

## 3. Navigation and UI Flow

### 3.1 Home Page Flow
- [ ] **Test**: Fresh page load (no file uploaded)
- [ ] **Expected**:
  - Only file upload section visible
  - Company/Warehouse dropdowns hidden
  - Save button disabled
  - Clear instructions visible
- [ ] **Test**: After file upload/refresh
- [ ] **Expected**:
  - Company dropdown appears
  - Warehouse dropdown appears after company selection
  - Date dropdown appears (if dates in file)
  - Save button enabled when company selected
- [ ] **Test**: Select company → warehouse → date → Save
- [ ] **Expected**: Redirects to Summary page with correct data

### 3.2 Navigation Links
- [ ] **Test**: Click each nav link (Home, Summary, Reconcile)
- [ ] **Expected**: 
  - Correct page loads
  - Active link is highlighted
  - No broken routes
- [ ] **Test**: Direct URL access (e.g., /summary, /reconcile)
- [ ] **Expected**: Pages load correctly
- [ ] **Test**: Access removed routes (/stock, /reports, /admin)
- [ ] **Expected**: Redirects to Home page

### 3.3 Back/Forward Browser Navigation
- [ ] **Test**: Navigate between pages using browser back/forward
- [ ] **Expected**: State is preserved correctly
- [ ] **Test**: Refresh page on Summary/Reconcile
- [ ] **Expected**: Data persists or loads from sessionStorage

---

## 4. Data Validation and Error Handling

### 4.1 Stock Take Code Parsing
- [ ] **Test**: CSV with "Stock Take Code" in column E
- [ ] **Expected**: Column is found and parsed correctly
- [ ] **Test**: CSV with "Stock Take Code" in different column
- [ ] **Expected**: Column is found regardless of position
- [ ] **Test**: CSV without "Stock Take Code" column
- [ ] **Expected**: Clear error message listing available columns
- [ ] **Test**: CSV with malformed stock take codes
- [ ] **Expected**: Invalid codes are skipped, valid ones processed

### 4.2 Company/Warehouse Selection
- [ ] **Test**: Select company with no warehouses
- [ ] **Expected**: Warehouse dropdown shows "No warehouses found"
- [ ] **Test**: Change date selection
- [ ] **Expected**: Company/Warehouse lists update correctly
- [ ] **Test**: Select company, then change date
- [ ] **Expected**: Company selection resets if not valid for new date

### 4.3 Save Button Validation
- [ ] **Test**: Try to save without file uploaded
- [ ] **Expected**: Button is disabled, cannot click
- [ ] **Test**: Try to save without company selected
- [ ] **Expected**: Button is disabled
- [ ] **Test**: Save with all required fields
- [ ] **Expected**: Successfully saves and redirects

---

## 5. Edge Cases and Error Scenarios

### 5.1 Network/API Errors
- [ ] **Test**: Disconnect network, then refresh Excel
- [ ] **Expected**: Clear error message, no crash
- [ ] **Test**: API timeout during Excel refresh
- [ ] **Expected**: Timeout message, user can retry
- [ ] **Test**: Server error (500) during file upload
- [ ] **Expected**: Error message, user can retry

### 5.2 Session/State Management
- [ ] **Test**: Close browser, reopen, go to Summary page
- [ ] **Expected**: Previously selected data loads from sessionStorage
- [ ] **Test**: Clear browser cache/cookies
- [ ] **Expected**: App still works, prompts for new selection
- [ ] **Test**: Multiple browser tabs open
- [ ] **Expected**: Each tab maintains independent state

### 5.3 Excel File Scenarios
- [ ] **Test**: Excel file has no data (empty sheet)
- [ ] **Expected**: Clear message, no crash
- [ ] **Test**: Excel file has data but wrong worksheet name
- [ ] **Expected**: Falls back to active sheet, shows warning
- [ ] **Test**: Excel file is corrupted
- [ ] **Expected**: Error message, no crash
- [ ] **Test**: Excel file is password protected
- [ ] **Expected**: Error message explaining issue

### 5.4 CSV File Scenarios
- [ ] **Test**: CSV with only headers, no data rows
- [ ] **Expected**: Shows "No valid stock take codes found"
- [ ] **Test**: CSV with special characters in data
- [ ] **Expected**: Handles correctly, no parsing errors
- [ ] **Test**: CSV with different delimiters (tab, semicolon)
- [ ] **Expected**: Detects and handles correctly
- [ ] **Test**: Very large CSV file (100K+ rows)
- [ ] **Expected**: Processes without browser crash

---

## 6. User Experience Scenarios

### 6.1 First-Time User Flow
- [ ] **Test**: New user opens app
- [ ] **Expected**:
  - Clear instructions visible
  - Only file upload options shown
  - No confusing empty dropdowns
  - Helpful messages guide user
- [ ] **Test**: User uploads file for first time
- [ ] **Expected**: 
  - Success feedback is clear
  - Dropdowns appear with data
  - User can proceed intuitively

### 6.2 Returning User Flow
- [ ] **Test**: User returns after previous session
- [ ] **Expected**: 
  - Previous selections remembered (if applicable)
  - Can quickly proceed or change selection
  - No confusion about current state

### 6.3 Error Recovery
- [ ] **Test**: User encounters error, then fixes issue
- [ ] **Expected**: 
  - Can retry without page refresh
  - Error messages are actionable
  - No stuck states

---

## 7. Performance Testing

### 7.1 Excel Refresh Performance
- [ ] **Test**: Refresh with 1,000 rows
- [ ] **Expected**: Completes in <30 seconds
- [ ] **Test**: Refresh with 5,000 rows
- [ ] **Expected**: Completes in <60 seconds
- [ ] **Test**: Refresh with 10,000 rows
- [ ] **Expected**: Completes in <120 seconds
- [ ] **Test**: Multiple rapid refresh attempts
- [ ] **Expected**: Prevents concurrent refreshes, shows appropriate message

### 7.2 UI Responsiveness
- [ ] **Test**: Click buttons rapidly
- [ ] **Expected**: No double-submissions, proper disabled states
- [ ] **Test**: Large dropdown lists (100+ companies)
- [ ] **Expected**: Dropdown is scrollable, performs well
- [ ] **Test**: Page load time
- [ ] **Expected**: Initial load <2 seconds

---

## 8. Browser Compatibility

### 8.1 Supported Browsers
- [ ] **Test**: Chrome (latest)
- [ ] **Test**: Edge (latest)
- [ ] **Test**: Firefox (latest)
- [ ] **Test**: Safari (if applicable)
- [ ] **Expected**: All functionality works in each browser

### 8.2 Mobile/Tablet (if applicable)
- [ ] **Test**: Responsive design on mobile
- [ ] **Expected**: UI is usable, buttons are tappable
- [ ] **Test**: File upload on mobile
- [ ] **Expected**: Works with mobile file picker

---

## 9. Security Testing

### 9.1 Authentication
- [ ] **Test**: Access protected routes without login
- [ ] **Expected**: Redirects to login or shows appropriate message
- [ ] **Test**: Session expiry
- [ ] **Expected**: User is logged out gracefully

### 9.2 File Upload Security
- [ ] **Test**: Upload non-CSV file (e.g., .exe, .js)
- [ ] **Expected**: Rejected or handled safely
- [ ] **Test**: Upload file with malicious content
- [ ] **Expected**: No code execution, safe handling

---

## 10. Data Integrity

### 10.1 CSV Data Accuracy
- [ ] **Test**: Verify extracted CSV matches Excel source
- [ ] **Expected**: All rows and columns match exactly
- [ ] **Test**: Verify special characters are preserved
- [ ] **Expected**: Quotes, commas, newlines handled correctly
- [ ] **Test**: Verify numeric data accuracy
- [ ] **Expected**: Numbers match Excel values exactly

### 10.2 Data Persistence
- [ ] **Test**: Selected company/warehouse persists across page navigation
- [ ] **Expected**: Selections maintained in sessionStorage
- [ ] **Test**: Uploaded file data persists
- [ ] **Expected**: Data available after page refresh

---

## 11. Accessibility Testing

### 11.1 Keyboard Navigation
- [ ] **Test**: Navigate entire app using only keyboard
- [ ] **Expected**: All interactive elements accessible
- [ ] **Test**: Tab order is logical
- [ ] **Expected**: Focus moves in intuitive order

### 11.2 Screen Reader Compatibility
- [ ] **Test**: Use screen reader (if applicable)
- [ ] **Expected**: All content is readable
- [ ] **Test**: Form labels are properly associated
- [ ] **Expected**: Labels read correctly

---

## 12. Regression Testing Checklist

### 12.1 Previously Working Features
- [ ] Excel refresh still works after all changes
- [ ] File upload still works
- [ ] Navigation still works
- [ ] Data parsing still accurate
- [ ] Summary page still displays correctly
- [ ] Reconcile page still functions

### 12.2 No Breaking Changes
- [ ] Existing workflows still work
- [ ] No new errors in console
- [ ] No performance degradation
- [ ] UI improvements don't break functionality

---

## 13. User Acceptance Testing Scenarios

### 13.1 Complete Workflow Test
1. [ ] User opens Home page
2. [ ] User clicks "Refresh Excel"
3. [ ] Wait for refresh to complete
4. [ ] User selects date (if multiple available)
5. [ ] User selects company
6. [ ] User selects warehouse
7. [ ] User clicks Save
8. [ ] User lands on Summary page
9. [ ] User can view data correctly
10. [ ] User can navigate to Reconcile
11. [ ] User can upload Journal file
12. [ ] User can upload Counts file
13. [ ] User can preview variances
14. [ ] User can apply adjustments

### 13.2 Error Recovery Workflow
1. [ ] User tries to refresh Excel but file is missing
2. [ ] User sees clear error message
3. [ ] User fixes issue (places file)
4. [ ] User retries refresh
5. [ ] Refresh succeeds
6. [ ] User can continue workflow

---

## 14. Critical Path Testing

### Must Work 100% of the Time:
- [ ] Excel refresh completes successfully
- [ ] CSV data extraction is accurate
- [ ] Company/Warehouse selection works
- [ ] Save button saves and redirects
- [ ] Summary page displays data
- [ ] File uploads work on Reconcile page
- [ ] No crashes or unhandled errors

---

## 15. Testing Environment Setup

### Pre-Testing Checklist:
- [ ] Excel file (RefreshExcel.xlsm) is in correct location
- [ ] Excel macro is working correctly
- [ ] Test CSV files prepared (various sizes, formats)
- [ ] Server is running
- [ ] Database/backend is accessible
- [ ] Browser console is open for error checking
- [ ] Network tab open to monitor API calls

---

## 16. Test Data Requirements

### Test Files Needed:
1. **Valid CSV** - Standard format with Stock Take Code in column E
2. **Large CSV** - 10,000+ rows for performance testing
3. **Invalid CSV** - Missing required columns
4. **Edge Case CSV** - Special characters, empty rows, etc.
5. **Journal CSV** - For Reconcile page testing
6. **Counts CSV** - For Reconcile page testing

---

## 17. Bug Reporting Template

When issues are found, document:
- **Steps to Reproduce**: Detailed steps
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Error Messages**: Exact error text
- **Browser/OS**: Environment details
- **Screenshots**: If applicable
- **Console Errors**: Any JavaScript errors
- **Network Errors**: Any API failures

---

## 18. Sign-Off Criteria

Before deployment, ensure:
- [ ] All critical path tests pass
- [ ] No console errors in normal usage
- [ ] All error scenarios handled gracefully
- [ ] Performance is acceptable (<2 min for 10K rows)
- [ ] UI is intuitive for first-time users
- [ ] All navigation works correctly
- [ ] Data accuracy verified
- [ ] Mobile/responsive design works (if applicable)

---

## Notes
- Test with real Excel files from production
- Test with various user skill levels
- Document any workarounds needed
- Keep test results for future reference
- Update this plan as new features are added

