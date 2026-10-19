import axios from 'axios';

/** In dev, Vite proxies /readings and /auth to the backend (see vite.config.js). */
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const API = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

export const API_BASE_URL = API_BASE || window.location.origin;

const getWebSocketBase = () => {
  if (!API_BASE) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  if (API_BASE.startsWith('https://')) return API_BASE.replace('https://', 'wss://');
  if (API_BASE.startsWith('http://')) return API_BASE.replace('http://', 'ws://');
  const url = new URL(API_BASE, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href.replace(/\/$/, '');
};

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const expiryListeners = new Set();
export const subscribeSessionExpiry = (callback) => {
  expiryListeners.add(callback);
  return () => expiryListeners.delete(callback);
};
API.interceptors.response.use((response) => response, (error) => {
  const savedToken = localStorage.getItem('token');
  if (error.response?.status === 401 && savedToken &&
      error.config?.headers?.Authorization === `Bearer ${savedToken}` &&
      !error.config.url.includes('/login')) {
    expiryListeners.forEach((callback) => callback());
  }
  return Promise.reject(error);
});

// Healthcare Provider auth
export const registerProvider = (data) => API.post('/auth/medical/register', data);
export const loginProvider = (data) => API.post('/auth/medical/login', data);
export const getProviderMe = () => API.get('/auth/medical/me');
export const updateProviderProfile = (data) => API.patch('/auth/medical/me', data);
export const changeProviderPassword = (data) => API.post('/auth/medical/change-password', data);

// Patient auth
export const loginPatient = (data) => API.post('/auth/patient/login', data);
export const getPatientMe = () => API.get('/auth/patient/me');

// Patients (provider)
export const getPatients = () => API.get('/patients/');
export const addPatient = (data) => API.post('/patients/', data);
export const deletePatient = (id) => API.delete(`/patients/${id}`);
export const getPatient = (id) => API.get(`/patients/${id}`);
export const updatePatientDetails = (id, data) => API.patch(`/patients/${id}`, data);
export const resetPatientPassword = (id, data = {}) => API.post(`/patients/${id}/reset-password`, data);

// Readings (provider)
export const getAllReadings = () => API.get('/readings/all');
export const getPatientReadings = (id) => API.get(`/readings/patient/${id}`);
export const getLatestReading = (id) => API.get(`/readings/patient/${id}/latest`);
export const sendSensorData = (data) => API.post('/readings/sensor', data);
export const startSimulation = (data) => API.post('/readings/simulations', data);
export const getSimulation = (id) => API.get(`/readings/simulations/${id}`);
export const advanceSimulation = (id) => API.post(`/readings/simulations/${id}/advance`);
export const cancelSimulation = (id) => API.post(`/readings/scans/${id}/cancel`);
export const checkListenerApi = () => API.get('/readings/listener/ping');
export const startListener = (patientId) =>
  API.post('/readings/listener/start', { patient_id: patientId });
export const stopListener = (sessionId) => API.post('/readings/listener/stop', sessionId ? { session_id: sessionId } : undefined);
export const getArmedPatient = () => API.get('/readings/listener/armed-patient');
export const getScanStatus = (sessionId) => API.get(`/readings/scans/${sessionId}`);
export const getAcquisition = (acquisitionId) => API.get(`/readings/acquisitions/${acquisitionId}`);
export const deleteReading = (id) => API.delete(`/readings/${id}`);

// Readings (patient)
export const getMyReadings = () => API.get('/readings/my');
export const getMyLatestReading = () => API.get('/readings/my/latest');

export const getReadingsWebSocketUrl = () => `${getWebSocketBase()}/readings/ws/medical`;
