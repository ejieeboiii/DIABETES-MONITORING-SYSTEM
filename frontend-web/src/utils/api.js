import axios from 'axios';

/** In dev, Vite proxies /readings and /auth to the backend (see vite.config.js). */
const API_BASE = import.meta.env.DEV ? '' : 'http://127.0.0.1:8000';

const API = axios.create({
  baseURL: API_BASE,
});

export const API_BASE_URL = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.host}`
  : 'http://127.0.0.1:8000';

const getWebSocketBase = () => {
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  if (API_BASE.startsWith('https://')) return API_BASE.replace('https://', 'wss://');
  if (API_BASE.startsWith('http://')) return API_BASE.replace('http://', 'ws://');
  return `ws://${API_BASE}`;
};

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Healthcare Provider auth
export const registerProvider = (data) => API.post('/auth/medical/register', data);
export const loginProvider = (data) => API.post('/auth/medical/login', data);
export const getProviderMe = () => API.get('/auth/medical/me');

// Patient auth
export const loginPatient = (data) => API.post('/auth/patient/login', data);
export const getPatientMe = () => API.get('/auth/patient/me');

// Patients (provider)
export const getPatients = () => API.get('/patients/');
export const addPatient = (data) => API.post('/patients/', data);
export const deletePatient = (id) => API.delete(`/patients/${id}`);
export const getPatient = (id) => API.get(`/patients/${id}`);
export const resetPatientPassword = (id, data = {}) => API.post(`/patients/${id}/reset-password`, data);

// Readings (provider)
export const getAllReadings = () => API.get('/readings/all');
export const getPatientReadings = (id) => API.get(`/readings/patient/${id}`);
export const getLatestReading = (id) => API.get(`/readings/patient/${id}/latest`);
export const sendSensorData = (data) => API.post('/readings/sensor', data);
export const checkListenerApi = () => API.get('/readings/listener/ping');
export const startListener = (patientId) =>
  API.post('/readings/listener/start', { patient_id: patientId });
export const stopListener = () => API.post('/readings/listener/stop');
export const deleteReading = (id) => API.delete(`/readings/${id}`);

// Readings (patient)
export const getMyReadings = () => API.get('/readings/my');
export const getMyLatestReading = () => API.get('/readings/my/latest');

export const getReadingsWebSocketUrl = ({ token, patientId }) => {
  const params = new URLSearchParams();
  params.set('token', token || '');
  if (patientId != null && patientId !== '') {
    params.set('patient_id', String(patientId));
  }
  return `${getWebSocketBase()}/readings/ws/medical?${params.toString()}`;
};
