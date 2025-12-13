const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  return response;
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (typeof data?.detail === "string") return data.detail;
      if (typeof data?.message === "string") return data.message;
      if (typeof data?.error === "string") return data.error;
    }
    const text = await response.text();
    if (text) return text;
  } catch {
    // ignore
  }
  return fallback;
}

export async function login(password: string): Promise<{ access_token: string }> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, "Invalid password"));
  }

  const data = await response.json();
  localStorage.setItem("token", data.access_token);
  return data;
}

export async function logout() {
  localStorage.removeItem("token");
  window.location.href = "/login";
}

export async function search(query: string, sites?: string[]) {
  const response = await fetchWithAuth("/api/search", {
    method: "POST",
    body: JSON.stringify({ query, sites, limit: 20 }),
  });

  if (!response.ok) throw new Error(await getErrorMessage(response, "Search failed"));

  return response.json();
}

export async function searchWithProgress(
  query: string,
  sites?: string[],
  onProgress?: (data: any) => void
) {
  const response = await fetchWithAuth("/api/search/progress", {
    method: "POST",
    body: JSON.stringify({ query, sites, limit: 20 }),
  });

  if (!response.ok) throw new Error(await getErrorMessage(response, "Search failed"));

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("No response body");
  }

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (onProgress) {
              onProgress(data);
            }
            
            if (data.type === 'complete') {
              return data;
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new Error("Search completed without results");
}

export async function getQueue() {
  const response = await fetchWithAuth("/api/queue");
  if (!response.ok) throw new Error(await getErrorMessage(response, "Failed to fetch queue"));
  return response.json();
}

export async function addToQueue(urls: string[]) {
  const response = await fetchWithAuth("/api/queue", {
    method: "POST",
    body: JSON.stringify({ urls }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, "Failed to add to queue"));
  return response.json();
}

export async function removeFromQueue(id: number) {
  const response = await fetchWithAuth(`/api/queue/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, "Failed to remove from queue"));
  return response.json();
}

export async function retryDownload(id: number) {
  const response = await fetchWithAuth(`/api/queue/${id}/retry`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, "Failed to retry download"));
  return response.json();
}

export async function getDownloads(page = 1, limit = 20, search?: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set("search", search);

  const response = await fetchWithAuth(`/api/downloads?${params}`);
  if (!response.ok) throw new Error(await getErrorMessage(response, "Failed to fetch downloads"));
  return response.json();
}

export async function deleteDownload(id: number) {
  const response = await fetchWithAuth(`/api/downloads/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, "Failed to delete download"));
  return response.json();
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
