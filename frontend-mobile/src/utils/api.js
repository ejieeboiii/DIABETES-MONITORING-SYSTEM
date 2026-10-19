import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from './apiBaseUrl';

export const API_BASE_URL = getApiBaseUrl();

const toWsBase = (httpBase) => {
  if (httpBase.startsWith('https://')) return httpBase.replace('https://', 'wss://');
  if (httpBase.startsWith('http://')) return httpBase.replace('http://', 'ws://');
  return `ws://${httpBase}`;
};

const API = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
});

API.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const expiryListeners = new Set();
export const subscribeSessionExpiry = (callback) => {
  expiryListeners.add(callback);
  return () => expiryListeners.delete(callback);
};
API.interceptors.response.use((response) => response, async (error) => {
  const savedToken = await AsyncStorage.getItem('token');
  if (error.response?.status === 401 && savedToken &&
      error.config?.headers?.Authorization === `Bearer ${savedToken}` &&
      !error.config.url.includes('/login')) {
    expiryListeners.forEach((callback) => callback());
  }
  return Promise.reject(error);
});

// Patient auth
export const loginPatient = (data) => API.post('/auth/patient/login', data);
export const getPatientMe = () => API.get('/auth/patient/me');
export const updatePatientProfile = (data) => API.patch('/auth/patient/me', data);
export const changePatientPassword = (data) => API.post('/auth/patient/change-password', data);

// Patients
export const getPatients = () => API.get('/patients/');
export const addPatient = (data) => API.post('/patients/', data);
export const deletePatient = (id) => API.delete(`/patients/${id}`);
export const resetPatientPassword = (id, data = {}) => API.post(`/patients/${id}/reset-password`, data);

// Readings
export const getAllReadings = () => API.get('/readings/all');
export const getPatientReadings = (id) => API.get(`/readings/patient/${id}`);
export const getLatestReading = (id) => API.get(`/readings/patient/${id}/latest`);
export const sendSensorData = (data) => API.post('/readings/sensor', data);
export const deleteReading = (id) => API.delete(`/readings/${id}`);

// Readings (patient)
export const getMyReadings = () => API.get('/readings/my');
export const getMyLatestReading = () => API.get('/readings/my/latest');

export const getReadingsWebSocketUrl = async () => `${toWsBase(getApiBaseUrl())}/readings/ws/medical`;
