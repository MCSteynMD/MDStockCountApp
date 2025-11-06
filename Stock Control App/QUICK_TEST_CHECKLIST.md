# Quick Testing Checklist - Daily Use

## Pre-Deployment Quick Test (15 minutes)

### Critical Path - Must Work Every Time
- [ ] **Home Page Load**
  - Page loads without errors
  - File upload section visible
  - Company/Warehouse dropdowns hidden initially

- [ ] **Excel Refresh**
  - Click "Refresh Excel" button
  - Wait for completion (watch progress messages)
  - Verify: Company dropdown appears with data
  - Verify: Date dropdown appears (if dates in file)
  - No errors in browser console

- [ ] **File Upload (Alternative)**
  - Click "Upload File" button
  - Select valid CSV file
  - Verify: Success message appears
  - Verify: Dropdowns populate

- [ ] **Selection Flow**
  - Select date (if multiple available)
  - Select company → Warehouse dropdown appears
  - Select warehouse
  - Verify: Save button is enabled

- [ ] **Save & Navigation**
  - Click Save button
  - Verify: Redirects to Summary page
  - Verify: Data displays correctly

- [ ] **Reconcile Page**
  - Navigate to Reconcile
  - Upload Journal file → Success message appears
  - Upload Counts file → Success message appears
  - Verify: No CSV textareas visible (only success messages)

- [ ] **Navigation**
  - Click all nav links (Home, Summary, Reconcile)
  - Verify: All pages load correctly
  - Verify: Active link is highlighted

---

## Error Scenarios Quick Test (10 minutes)

- [ ] **Excel Refresh Errors**
  - Try refresh with Excel file missing → Error message appears
  - Try refresh with Excel open in another app → Appropriate handling

- [ ] **File Upload Errors**
  - Upload invalid file type → Error message
  - Upload empty file → Appropriate message

- [ ] **Validation**
  - Try to save without file → Button disabled
  - Try to save without company → Button disabled

- [ ] **Network Errors**
  - Disconnect network, try refresh → Error message
  - Reconnect, retry → Works correctly

---

## Browser Console Check
- [ ] Open browser console (F12)
- [ ] Navigate through app
- [ ] Verify: No red errors appear
- [ ] Verify: No warnings that indicate problems

---

## Performance Check
- [ ] Excel refresh with 1,000 rows → Completes in <30 seconds
- [ ] Excel refresh with 5,000 rows → Completes in <60 seconds
- [ ] Large file upload → Handles without freezing

---

## User Experience Check
- [ ] First-time user can understand what to do
- [ ] Error messages are clear and helpful
- [ ] Success messages are visible
- [ ] Buttons are clearly enabled/disabled
- [ ] Navigation is intuitive

---

## Sign-Off
- [ ] All critical path tests pass
- [ ] No console errors
- [ ] Performance acceptable
- [ ] Ready for deployment

**Date Tested**: _______________  
**Tested By**: _______________  
**Notes**: _______________

