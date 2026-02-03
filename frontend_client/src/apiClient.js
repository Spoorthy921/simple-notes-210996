const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Normalize base URL by trimming whitespace and trailing slash.
 * @param {string} base
 */
function normalizeBase(base) {
  return String(base || "").trim().replace(/\/+$/, "");
}

/**
 * Resolve API base URL from environment variables.
 * Prefers REACT_APP_API_BASE, falls back to REACT_APP_BACKEND_URL.
 * @returns {string}
 */
function resolveApiBase() {
  const base =
    process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_BACKEND_URL ||
    "";
  const normalized = normalizeBase(base);
  if (!normalized) {
    // Keep an explicit error; UI will show a user-friendly message.
    throw new Error(
      "API base URL is not configured. Set REACT_APP_API_BASE (preferred) or REACT_APP_BACKEND_URL."
    );
  }
  return normalized;
}

/**
 * Build a full URL for an API path.
 * @param {string} path
 * @returns {string}
 */
function apiUrl(path) {
  const base = resolveApiBase();
  const cleanPath = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Make an HTTP request with JSON response + optional JSON body.
 * @param {string} path
 * @param {RequestInit & { timeoutMs?: number }} options
 */
async function requestJson(path, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(apiUrl(path), {
      ...fetchOptions,
      headers: {
        Accept: "application/json",
        ...(fetchOptions.body ? { "Content-Type": "application/json" } : {}),
        ...(fetchOptions.headers || {}),
      },
      signal: controller.signal,
    });

    // Handle empty body responses (e.g., DELETE 204)
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");

    let payload = null;
    if (isJson) {
      // If server sends invalid JSON, surface a clean error.
      try {
        payload = await res.json();
      } catch (e) {
        throw new Error("Server returned invalid JSON.");
      }
    } else {
      // Allow text for errors or non-JSON responses.
      const text = await res.text();
      payload = text ? { message: text } : null;
    }

    if (!res.ok) {
      const message =
        (payload && payload.message) ||
        `Request failed with status ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      err.payload = payload;
      throw err;
    }

    return payload;
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw e;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// PUBLIC_INTERFACE
export const notesApi = {
  /** Fetch list of notes. */
  async listNotes() {
    return requestJson("/notes", { method: "GET" });
  },

  /** Fetch a single note by id. */
  async getNote(id) {
    return requestJson(`/notes/${encodeURIComponent(id)}`, { method: "GET" });
  },

  /** Create a new note. Expects {title, content}. */
  async createNote(note) {
    return requestJson("/notes", {
      method: "POST",
      body: JSON.stringify(note),
    });
  },

  /** Update an existing note. Expects {title, content}. */
  async updateNote(id, note) {
    return requestJson(`/notes/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(note),
    });
  },

  /** Delete a note by id. */
  async deleteNote(id) {
    return requestJson(`/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
