export function apiErrorMessage(error, fallback = 'Could not complete the request. Please retry.') {
  if (error?.response?.status === 401) return error.config?.url?.includes('/login') ? 'Invalid email or password.' : 'Your session expired. Please log in again.';
  if (error?.response?.status === 403) return 'You do not have permission to perform this action.';
  if (!error?.response) return 'Cannot reach the server. Check your connection and retry.';
  const detail = error.response.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(', ');
  return fallback;
}
