import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import XLSX from 'xlsx';

export function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return new Promise((resolve, reject) => {
    Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0) {
          reject(new Error(result.errors.map(e => e.message).join(', ')));
        } else {
          resolve({
            headers: result.meta.fields || [],
            rows: result.data
          });
        }
      },
      error: (err) => reject(err)
    });
  });
}

export function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  return { headers, rows: data };
}