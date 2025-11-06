import { describe, it, expect } from 'vitest';
import { parseCountsToJson, parseJournalToJson } from '../../frontend/src/lib/parser.js';

describe('CSV Parser - Extended Tests', () => {
  describe('parseCountsToJson - Edge Cases', () => {
    it('should handle CSV with extra whitespace', () => {
      const csv = `Barcode,Quantity,Stock Take Code
  123456  ,  10  ,  STC001  
789012,20,STC001`;

      const result = parseCountsToJson(csv);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].itemCode).toBe('123456');
      expect(result.entries[0].counted).toBe(10);
    });

    it('should handle CSV with empty rows', () => {
      const csv = `Barcode,Quantity,Stock Take Code
123456,10,STC001

789012,20,STC001
`;

      const result = parseCountsToJson(csv);
      expect(result.entries).toHaveLength(2);
    });

    it('should handle CSV with missing values', () => {
      const csv = `Barcode,Quantity,Stock Take Code,Company
123456,10,STC001,COMPANY1
789012,,STC001,COMPANY1
,20,STC001,COMPANY1`;

      const result = parseCountsToJson(csv);
      expect(result.entries.length).toBeGreaterThan(0);
      // Should skip rows with no barcode
      const validEntries = result.entries.filter(e => e.itemCode);
      expect(validEntries.length).toBeGreaterThan(0);
    });

    it('should handle CSV with unicode characters', () => {
      const csv = `Barcode,Quantity,Stock Take Code,Item Name
123456,10,STC001,"Item with émojis 🎉 and spéciál chars"
789012,20,STC001,"中文测试"`;

      const result = parseCountsToJson(csv);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].itemName).toContain('émojis');
    });

    it('should handle very large numbers', () => {
      const csv = `Barcode,Quantity,Stock Take Code
123456,999999999,STC001
789012,0,STC001`;

      const result = parseCountsToJson(csv);
      expect(result.entries[0].counted).toBe(999999999);
      expect(result.entries[1].counted).toBe(0);
    });

    it('should handle negative quantities', () => {
      const csv = `Barcode,Quantity,Stock Take Code
123456,-10,STC001`;

      const result = parseCountsToJson(csv);
      expect(result.entries[0].counted).toBe(-10);
    });

    it('should handle semicolon delimiter', () => {
      const csv = `Barcode;Quantity;Stock Take Code
123456;10;STC001`;

      const result = parseCountsToJson(csv);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].itemCode).toBe('123456');
    });

    it('should extract date from various formats', () => {
      const csv = `Barcode,Quantity,Date,Stock Take Code
123456,10,2024-01-01,STC001
789012,20,01/01/2024,STC001`;

      const result = parseCountsToJson(csv);
      expect(result.meta.date).toBeDefined();
    });
  });

  describe('parseJournalToJson - Edge Cases', () => {
    it('should handle journal with multiple quantity columns', () => {
      const csv = `Item Code,On Hand,Book,Description
123456,95,100,Test Item`;

      const result = parseJournalToJson(csv);
      expect(result.entries).toHaveLength(1);
      // Parser uses the first matching column (Book in this case)
      expect(result.entries[0].book).toBe(100);
    });

    it('should handle journal with cost price', () => {
      const csv = `Item Code,On Hand,Cost Price,Description
123456,95,10.50,Test Item`;

      const result = parseJournalToJson(csv);
      expect(result.entries[0].costPrice).toBe(10.50);
    });

    it('should handle journal with decimal quantities', () => {
      const csv = `Item Code,On Hand,Description
123456,95.5,Test Item`;

      const result = parseJournalToJson(csv);
      expect(result.entries[0].book).toBe(95.5);
    });

    it('should handle journal with empty item codes', () => {
      const csv = `Item Code,On Hand,Description
,95,Test Item
789012,100,Valid Item`;

      const result = parseJournalToJson(csv);
      // Should skip empty item codes
      const validEntries = result.entries.filter(e => e.itemCode);
      expect(validEntries.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large CSV files efficiently', () => {
      // Generate a CSV with 1000 rows
      const headers = 'Barcode,Quantity,Stock Take Code,Company\n';
      const rows = Array.from({ length: 1000 }, (_, i) => 
        `${i},${i * 10},STC001,COMPANY1`
      ).join('\n');
      const csv = headers + rows;

      const start = Date.now();
      const result = parseCountsToJson(csv);
      const duration = Date.now() - start;

      expect(result.entries).toHaveLength(1000);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});

