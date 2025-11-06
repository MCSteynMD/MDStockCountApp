import axios from 'axios';

export const api = axios.create({
  baseURL: '/',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10 * 60 * 1000, // 10 minutes timeout for long-running operations like Excel refresh
});


