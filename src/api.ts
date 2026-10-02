import type { DomainId, Run, Sample, State, Upload } from './types';

export interface AuthState { required: boolean; authenticated: boolean; username: string }
const base = import.meta.env.BASE_URL;

function withArtifactUrls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withArtifactUrls) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      key === 'download_url' && typeof item === 'string' && item.startsWith('/api/')
        ? `${base}${item.slice(1)}` : withArtifactUrls(item),
    ])) as T;
  }
  return value;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}api${path}`, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth')) window.dispatchEvent(new Event('workbench-auth-required'));
    const body = await res.json().catch(() => ({ error: `请求失败（${res.status}）` }));
    throw new Error(body.error || `请求失败（${res.status}）`);
  }
  return res.status === 204 ? undefined as T : withArtifactUrls(await res.json());
}
export const api = {
  auth: () => request<AuthState>('/auth'),
  login: (password: string) => request<AuthState>('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  state: () => request<State>('/state'),
  sample: (domain: DomainId) => request<Sample>(`/samples/${domain}`),
  run: (id: string) => request<Run>(`/runs/${id}`),
  post: <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T,>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (path: string) => request<void>(path, { method: 'DELETE' }),
  upload: async (file: File) => {
    if (file.size > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB');
    const content_base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
    return api.post<Upload>('/uploads', { filename: file.name, content_base64 });
  },
};
