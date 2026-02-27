/* Notetet Notes App functionality
   - Create / Save / Autosave
   - List notes
   - Search notes (title, tags, content)
   - Delete note
   - Export note to .txt
   - Insert helpers (bullet/check/heading/code)
   - LocalStorage persistence
   - Status indicators (saving/saved)
   - Keyboard accessible (tab navigation, enter to select)
   -  Debounced autosave to prevent excessive writes
   * Note most of this logic was pulled from other note-taking soruce code from the github. 
   I just modified it to fit my needs and added comments to explain how it works.
*/

// Wrapping everything in an IIFE to avoid polluting global scope and 
// ensure code runs after DOM is loaded.
(function () {
  const STORAGE_KEY = "notetet_notes_v1";

  // Elements 
  const noteListEl = document.getElementById("noteList");
  const titleEl = document.getElementById("titleInput");
  const tagsEl = document.getElementById("tagsInput");
  const contentEl = document.getElementById("contentInput");
  const searchEl = document.getElementById("searchInput");

  const btnNew = document.getElementById("btnNewNote");
  const btnSave = document.getElementById("btnSave");
  const btnDelete = document.getElementById("btnDelete");
  const btnExport = document.getElementById("btnExport");
  const saveDot = document.getElementById("saveDot");
  const statusText = document.getElementById("statusText");

  // If script is loaded on non-projects pages, just exit gracefully
  if (!noteListEl || !titleEl || !tagsEl || !contentEl) return;

  // State
  /** @type {{id:string,title:string,tags:string[],content:string,updatedAt:number,createdAt:number}[]} */
  let notes = loadNotes();
  let activeId = notes[0]?.id ?? null;

  // Initialization
  if (!activeId) {
    const n = createBlankNote();
    notes.unshift(n);
    activeId = n.id;
    saveNotes();
  }
  renderList();
  loadActiveNoteIntoEditor();

  // Events
  btnNew.addEventListener("click", () => {
    const n = createBlankNote();
    notes.unshift(n);
    activeId = n.id;
    saveNotes();
    renderList();
    loadActiveNoteIntoEditor();
    setStatus("New note created", "saved");
  });

 // Manual save button (in addition to autosave) for user reassurance and control.
  btnSave.addEventListener("click", () => {
    commitEditorToActive();
    saveNotes();
    renderList();
    setStatus("Saved", "saved");
  });

// Delete with confirmation to prevent accidental loss of data. 
// If the deleted note is the active one, switch to another note or create a new one if none remain.
  btnDelete.addEventListener("click", () => {
    if (!activeId) return;
    const current = notes.find(n => n.id === activeId);
    const ok = confirm(`Delete this note?\n\n"${current?.title || "Untitled"}"`);
    if (!ok) return;

    // Remove the active note from the notes array. Then, if there are no notes left, 
    // create a new blank note.
    notes = notes.filter(n => n.id !== activeId);
    if (notes.length === 0) {
      const n = createBlankNote();
      notes.unshift(n);
      activeId = n.id;
    } else {
      activeId = notes[0].id;
    }

    // After deletion, save the updated notes array and refresh the UI to reflect changes.
    saveNotes();
    renderList();
    loadActiveNoteIntoEditor();
    setStatus("Deleted", "saved");
  });

  // Export the active note as a .txt file. The filename is based on the note title, 
  // made for safe file naming.
  btnExport.addEventListener("click", () => {
    const n = getActiveNote();
    if (!n) return;

    // Create a safe filename by taking the note title, converting to lowercase,
    // replacing non-alphanumeric characters with dashes, and trimming leading/trailing dashes.
    const safeTitle = (n.title || "notetet-note")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const txt = [
      `Title: ${n.title || "Untitled"}`,
      `Tags: ${n.tags.join(", ") || "(none)"}`,
      `Updated: ${new Date(n.updatedAt).toLocaleString()}`,
      "",
      n.content || ""
    ].join("\n");
    
    // Create a Blob from the note content and trigger a download with a filename 
    // based on the note title.
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    // Create a temporary anchor element to trigger the download, then clean up the URL object.
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("Exported .txt", "saved");
  });

  // Autosave while typing
  const autosave = debounce(() => {
    commitEditorToActive();
    saveNotes();
    renderList(true);
    setStatus("Autosaved", "saved");
  }, 650);

  // Add input event listeners to title, tags, and content fields to 
  // trigger autosave whenever the user makes changes.
  [titleEl, tagsEl, contentEl].forEach(el => {
    el.addEventListener("input", () => {
      setStatus("Saving...", "saving");
      autosave();
    });
  });

  // Search
  searchEl.addEventListener("input", () => {
    renderList();
  });

  // Insert toolbar helpers
  document.querySelectorAll(".tool").forEach(btn => {
    btn.addEventListener("click", () => {
      const insert = btn.getAttribute("data-insert") || "";
      insertIntoTextarea(contentEl, insert);
      contentEl.focus();
      setStatus("Saving...", "saving");
      autosave();
    });
  });

  // Helpers
  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }

  }
// Save the entire notes array to localStorage
  function saveNotes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

// Create a new blank note with default values
  function createBlankNote() {
    const now = Date.now();
    return {
      id: cryptoRandomId(),
      title: "",
      tags: [],
      content: "",
      createdAt: now,
      updatedAt: now,
    };
  }

// Get the currently active note object based on activeId
  function getActiveNote() {
    return notes.find(n => n.id === activeId) || null;
  }

// Load the active note's data into the editor fields
  function loadActiveNoteIntoEditor() {
    const n = getActiveNote();
    if (!n) return;

    titleEl.value = n.title ?? "";
    tagsEl.value = (n.tags ?? []).join(", ");
    contentEl.value = n.content ?? "";
  }

// Commits the current editor field values back to the active note object
  function commitEditorToActive() {
    const n = getActiveNote();
    if (!n) return;

    n.title = titleEl.value.trim();
    n.tags = parseTags(tagsEl.value);
    n.content = contentEl.value;
    n.updatedAt = Date.now();

    // Keep most recently edited near the top at all times
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  
  // Parses the raw tags input (comma-separated) into an array of trimmed, 
  // non-empty tags, limited to 12 tags.
  function parseTags(raw) {
    return raw
      .split(",")
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
   
  // Renders the list of notes in the sidebar, applying search filtering 
  // and preserving scroll position if needed.
  function renderList(preserveScroll = false) {
    const prevScroll = noteListEl.scrollTop;
    const q = (searchEl.value || "").trim().toLowerCase();
    
    // If there's a search query, filter notes by checking if the query is included
    // in the title, tags, or content of each note. If no query, show all notes.
    const filtered = q
      ? notes.filter(n => {
          const hay = [
            n.title || "",
            (n.tags || []).join(" "),
            n.content || ""
          ].join(" ").toLowerCase();
          return hay.includes(q);
        })
      : notes;

    noteListEl.innerHTML = "";

// Renders each note in the filtered list as a clickable item in the sidebar
    filtered.forEach(n => {
      const item = document.createElement("div");
      item.className = "note-item" + (n.id === activeId ? " active" : "");
      item.setAttribute("role", "button");
      item.tabIndex = 0;

// Create elements for the note title, metadata (updated time and content snippet), and tags
      const title = document.createElement("p");
      title.className = "note-title";
      title.textContent = n.title || "Untitled";

// The meta section shows the last updated time and a short snippet of the content 
// for quick reference in the sidebar.
      const meta = document.createElement("p");
      meta.className = "note-meta";
      meta.textContent = `${new Date(n.updatedAt).toLocaleString()} • ${snippet(n.content)}`;

// If the note has tags, create a container for them and add each tag as a span element.
      const tagsWrap = document.createElement("div");
      tagsWrap.className = "note-tags";
      (n.tags || []).slice(0, 4).forEach(t => {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = t;
        tagsWrap.appendChild(tag);
      });

// Append title, meta, and tags (if any) to the note item element
      item.appendChild(title);
      item.appendChild(meta);
      if ((n.tags || []).length) item.appendChild(tagsWrap);

      item.addEventListener("click", () => {
        // Save current note before switching (so nothing gets lost!!!!)
        commitEditorToActive();
        saveNotes();

        activeId = n.id;
        renderList(true);
        loadActiveNoteIntoEditor();
        setStatus("Loaded", "saved");
      });

      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") item.click();
      });

      noteListEl.appendChild(item);
    });

    if (preserveScroll) noteListEl.scrollTop = prevScroll;
  }

// Creates a short snippet of the note content for display in the sidebar list
  function snippet(text) {
    const clean = (text || "").replace(/\s+/g, " ").trim();
    return clean.length > 42 ? clean.slice(0, 42) + "…" : (clean || "No content yet");
  }

// Updates the status text and save dot indicator based on the current action (saving, saved, etc.)
  function setStatus(msg, mode) 
  {
    statusText.textContent = msg;
    saveDot.classList.remove("saving", "saved");
    if (mode === "saving") saveDot.classList.add("saving");
    if (mode === "saved") saveDot.classList.add("saved");
  }
// This function makes sure another function only runs after a pause, instead of running repeatedly.
  function debounce(fn, delay) 
  {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  }

// Inserts the given text at the current cursor position in 
// the textarea, with special handling for code blocks
  function insertIntoTextarea(textarea, insert) 
  
  {
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const value = textarea.value;

    // Special handling for code block to place cursor in between the blocks
    if (insert === "```") {
      const block = "```\n\n```";
      textarea.value = value.slice(0, start) + block + value.slice(end);
      const cursor = start + 4;
      textarea.setSelectionRange(cursor, cursor);
      return;
    }

// Default insertion for other tools
    textarea.value = value.slice(0, start) + insert + value.slice(end);
    const cursor = start + insert.length;
    textarea.setSelectionRange(cursor, cursor);
  }

  // Simple random ID generator. but good enough for what i was going for.
  function cryptoRandomId() 
  {
    // i found out that this works in browsers. If not available it falls back.
    if (window.crypto && crypto.getRandomValues) {
      // Generate a random 64-bit hex string using crypto API for better 
      // uniqueness and less collisions.
      const arr = new Uint32Array(2);
      // Fill the array with cryptographically secure random values, 
      // then convert to hex.
      crypto.getRandomValues(arr);
      // Combine the two 32-bit values into a single 64-bit hex string.
      return arr[0].toString(16) + arr[1].toString(16);
    }
    // Fallback to Math.random if crypto API is not available, combined with
    // current timestamp to reduce chances of collisions.
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
})();