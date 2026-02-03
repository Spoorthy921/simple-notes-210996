import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import { notesApi } from "./apiClient";

/**
 * @param {string} text
 */
function truncate(text, max = 70) {
  const s = String(text || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * @param {string} content
 */
function wordCount(content) {
  const trimmed = String(content || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// PUBLIC_INTERFACE
function App() {
  const apiBaseLabel = useMemo(() => {
    const base =
      process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "";
    return base ? base.replace(/\/+$/, "") : "(not configured)";
  }, []);

  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState("");

  const [mode, setMode] = useState("view"); // "view" | "edit" | "create"
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const selectedNote = useMemo(() => {
    return notes.find((n) => String(n.id) === String(selectedId)) || null;
  }, [notes, selectedId]);

  async function loadNotes({ keepSelection = true } = {}) {
    setListError("");
    setListLoading(true);
    try {
      const data = await notesApi.listNotes();
      const list = Array.isArray(data) ? data : data?.notes || [];
      setNotes(list);

      if (!keepSelection) {
        setSelectedId(null);
        return;
      }

      // If current selection no longer exists, clear it.
      if (selectedId != null) {
        const exists = list.some((n) => String(n.id) === String(selectedId));
        if (!exists) setSelectedId(null);
      }
    } catch (e) {
      setListError(e.message || "Failed to load notes.");
    } finally {
      setListLoading(false);
    }
  }

  async function loadNote(id) {
    setNoteError("");
    setNoteLoading(true);
    try {
      const note = await notesApi.getNote(id);
      // Some backends may return a wrapper object; attempt to unwrap.
      const resolved = note?.note ? note.note : note;
      // Update list item if present, or append.
      setNotes((prev) => {
        const idx = prev.findIndex((n) => String(n.id) === String(id));
        if (idx >= 0) {
          const clone = prev.slice();
          clone[idx] = { ...clone[idx], ...resolved };
          return clone;
        }
        return prev.concat(resolved);
      });
    } catch (e) {
      setNoteError(e.message || "Failed to load note.");
    } finally {
      setNoteLoading(false);
    }
  }

  useEffect(() => {
    // Initial list fetch
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When selecting a note, fetch fresh details.
  useEffect(() => {
    if (selectedId == null) return;
    loadNote(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function beginCreate() {
    setMode("create");
    setSelectedId(null);
    setDraftTitle("");
    setDraftContent("");
    setNoteError("");
  }

  function beginEdit() {
    if (!selectedNote) return;
    setMode("edit");
    setDraftTitle(selectedNote.title || "");
    setDraftContent(selectedNote.content || "");
    setNoteError("");
  }

  function cancelEdit() {
    if (selectedNote) {
      setMode("view");
      setDraftTitle("");
      setDraftContent("");
      return;
    }
    setMode("view");
    setDraftTitle("");
    setDraftContent("");
  }

  async function saveDraft() {
    setNoteError("");

    const title = String(draftTitle || "").trim();
    const content = String(draftContent || "").trim();

    if (!title) {
      setNoteError("Title is required.");
      return;
    }

    setNoteLoading(true);
    try {
      if (mode === "create") {
        const created = await notesApi.createNote({ title, content });
        const newNote = created?.note ? created.note : created;

        // Refresh list (backend may assign id, timestamps, ordering, etc.)
        await loadNotes({ keepSelection: false });

        // Prefer selecting returned id if present.
        if (newNote && newNote.id != null) {
          setSelectedId(newNote.id);
          setMode("view");
        } else {
          // If unknown, stay in view mode with no selection.
          setSelectedId(null);
          setMode("view");
        }
      } else if (mode === "edit" && selectedId != null) {
        const updated = await notesApi.updateNote(selectedId, { title, content });
        const updatedNote = updated?.note ? updated.note : updated;

        // Update list optimistically.
        setNotes((prev) =>
          prev.map((n) =>
            String(n.id) === String(selectedId) ? { ...n, ...updatedNote } : n
          )
        );
        setMode("view");
      }
    } catch (e) {
      setNoteError(e.message || "Failed to save note.");
    } finally {
      setNoteLoading(false);
    }
  }

  async function deleteSelected() {
    if (!selectedNote) return;
    const ok = window.confirm(
      `Delete "${selectedNote.title || "Untitled"}"? This cannot be undone.`
    );
    if (!ok) return;

    setNoteError("");
    setNoteLoading(true);
    try {
      await notesApi.deleteNote(selectedNote.id);
      setSelectedId(null);
      setMode("view");
      await loadNotes({ keepSelection: false });
    } catch (e) {
      setNoteError(e.message || "Failed to delete note.");
    } finally {
      setNoteLoading(false);
    }
  }

  function selectNote(id) {
    setMode("view");
    setDraftTitle("");
    setDraftContent("");
    setSelectedId(id);
  }

  return (
    <div className="App">
      <header className="appHeader">
        <div className="headerInner">
          <div className="brand">
            <div className="brandMark">RETRO•NOTES</div>
            <div>
              <h1 className="title">Simple Notes</h1>
              <p className="subtitle">API base: {apiBaseLabel}</p>
            </div>
          </div>

          <div className="headerActions">
            <button className="btn btnPrimary" onClick={beginCreate}>
              + New Note
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="container">
          <div className="split" role="region" aria-label="Notes workspace">
            {/* Left: list */}
            <section className="panel" aria-label="Notes list">
              <div className="retroStrip" aria-hidden="true" />
              <div className="panelHeader">
                <h2 className="panelTitle">Notes</h2>
                <button
                  className="btn btnSmall"
                  onClick={() => loadNotes()}
                  disabled={listLoading}
                  aria-label="Refresh notes list"
                >
                  Refresh
                </button>
              </div>
              <div className="panelBody">
                {listLoading ? (
                  <div className="loading" aria-live="polite">
                    Loading…
                  </div>
                ) : listError ? (
                  <div className="errorBox" role="alert">
                    <strong>Could not load notes.</strong>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {listError}
                    </div>
                  </div>
                ) : notes.length === 0 ? (
                  <div className="muted">
                    No notes yet. Create your first note with <strong>New Note</strong>.
                  </div>
                ) : (
                  <ul className="list">
                    {notes.map((n) => {
                      const active = String(n.id) === String(selectedId);
                      const words = wordCount(n.content);
                      return (
                        <li key={n.id}>
                          <button
                            className={
                              "listItemBtn " + (active ? "listItemBtnActive" : "")
                            }
                            onClick={() => selectNote(n.id)}
                            aria-current={active ? "true" : "false"}
                          >
                            <div className="noteTitle">{n.title || "Untitled"}</div>
                            <div className="noteMeta">
                              <span className="pill">{words}w</span>
                              <span className="pill">{truncate(n.content || "", 42)}</span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            {/* Right: detail/editor */}
            <section className="panel" aria-label="Note detail">
              <div className="retroStrip" aria-hidden="true" />
              <div className="panelHeader">
                <h2 className="panelTitle">
                  {mode === "create"
                    ? "Create"
                    : mode === "edit"
                      ? "Edit"
                      : "Detail"}
                </h2>

                <div className="row" aria-label="Note actions">
                  <div className="spacer" />
                  {mode === "view" && selectedNote ? (
                    <>
                      <button className="btn btnSmall" onClick={beginEdit}>
                        Edit
                      </button>
                      <button className="btn btnSmall btnDanger" onClick={deleteSelected}>
                        Delete
                      </button>
                    </>
                  ) : null}

                  {mode !== "view" ? (
                    <>
                      <button
                        className="btn btnSmall btnSuccess"
                        onClick={saveDraft}
                        disabled={noteLoading}
                      >
                        Save
                      </button>
                      <button className="btn btnSmall" onClick={cancelEdit} disabled={noteLoading}>
                        Cancel
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="panelBody">
                {noteLoading ? (
                  <div className="loading" aria-live="polite">
                    Working…
                  </div>
                ) : null}

                {noteError ? (
                  <div className="errorBox" role="alert" style={{ marginBottom: 10 }}>
                    {noteError}
                  </div>
                ) : null}

                {mode === "create" || mode === "edit" ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveDraft();
                    }}
                  >
                    <label className="label" htmlFor="title">
                      Title
                    </label>
                    <input
                      id="title"
                      className="input"
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder="e.g. Shopping list"
                      autoFocus
                    />

                    <label className="label" htmlFor="content">
                      Content
                    </label>
                    <textarea
                      id="content"
                      className="textarea"
                      value={draftContent}
                      onChange={(e) => setDraftContent(e.target.value)}
                      placeholder="Type your note…"
                    />

                    <div className="muted" style={{ marginTop: 10 }}>
                      Tip: Use monospace content for maximum retro vibes.
                    </div>
                  </form>
                ) : selectedNote ? (
                  <div>
                    <div className="noteTitle" style={{ fontSize: 18 }}>
                      {selectedNote.title || "Untitled"}
                    </div>
                    <div className="muted" style={{ marginTop: 6 }}>
                      {wordCount(selectedNote.content)} words
                    </div>

                    <pre
                      style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background:
                          "linear-gradient(180deg, rgba(249, 250, 251, 0.85), rgba(255, 255, 255, 1))",
                        fontFamily: "var(--mono)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        lineHeight: 1.35,
                      }}
                    >
                      {selectedNote.content || ""}
                    </pre>
                  </div>
                ) : (
                  <div className="muted">
                    Select a note on the left, or create a new one.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
