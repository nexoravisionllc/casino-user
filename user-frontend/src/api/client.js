// Minimal fetch wrapper for the backend API.
//const BASE = 'https://frontbackend.fufvkgylntiyepgk.net/api';
const BASE = '/api';

export async function apiGet(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw new Error('Request failed.');
  return res.json();
}

export async function apiPost(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Response has no JSON body.
  }

  if (!res.ok) {
    const message = data?.message || 'Request failed. Please try again.';
    throw new Error(message);
  }
  return data;
}
