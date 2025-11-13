/**
 * Utility functions for managing future/scheduled counts
 */

/**
 * Get all future counts from storage
 */
export function getFutureCounts() {
  try {
    const stored = localStorage.getItem('futureCounts');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error loading future counts:', error);
    return [];
  }
}

/**
 * Save a future count
 */
export function saveFutureCount(count) {
  try {
    const counts = getFutureCounts();
    const newCount = {
      id: count.id || Date.now().toString(),
      date: count.date,
      company: count.company || '',
      warehouse: count.warehouse || '',
      notes: count.notes || '',
      createdAt: count.createdAt || new Date().toISOString(),
    };
    
    // If updating, replace existing; otherwise add new
    const existingIndex = counts.findIndex(c => c.id === newCount.id);
    if (existingIndex >= 0) {
      counts[existingIndex] = newCount;
    } else {
      counts.push(newCount);
    }
    
    // Sort by date
    counts.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    localStorage.setItem('futureCounts', JSON.stringify(counts));
    return newCount;
  } catch (error) {
    console.error('Error saving future count:', error);
    throw error;
  }
}

/**
 * Delete a future count
 */
export function deleteFutureCount(id) {
  try {
    const counts = getFutureCounts();
    const filtered = counts.filter(c => c.id !== id);
    localStorage.setItem('futureCounts', JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting future count:', error);
    return false;
  }
}

/**
 * Get future counts for a specific date
 */
export function getFutureCountsForDate(date) {
  const counts = getFutureCounts();
  const dateStr = date instanceof Date ? date.toISOString().split('T')[0] : date;
  return counts.filter(c => {
    const countDate = new Date(c.date).toISOString().split('T')[0];
    return countDate === dateStr;
  });
}

/**
 * Get future counts for a date range
 */
export function getFutureCountsForDateRange(startDate, endDate) {
  const counts = getFutureCounts();
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return counts.filter(c => {
    const countDate = new Date(c.date);
    return countDate >= start && countDate <= end;
  });
}



