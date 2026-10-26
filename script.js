
"use strict";

/*
 * SONORA — Music Player
 * Frontend: HTML, CSS, JavaScript
 * Music catalog: Jamendo API
 *
 * Set JAMENDO_CLIENT_ID to your own Jamendo client ID.
 * Never use this demo as a substitute for checking each track's licence.
 */

const CONFIG = {
  JAMENDO_CLIENT_ID: "c9af5175", // Ajoute ton client ID Jamendo ici.
  API_BASE: "https://api.jamendo.com/v3.0",
  PAGE_SIZE: 20
};

const STORAGE_KEYS = {
  favorites: "sonora:favorites:v1",
  playlists: "sonora:playlists:v1",
  volume: "sonora:volume:v1"
};

const FALLBACK_COVER =
  "https://placehold.co/500x500/211a33/c9b6ff?text=SONORA";

const DEMO_TRACKS = [
  {
    id: "demo-1",
    name: "Creative Minds",
    artist_name: "Benjamin Tissot",
    image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?w=500&h=500&fit=crop",
    audio: "https://www.bensound.com/bensound-music/bensound-creativeminds.mp3",
    duration: 138,
    album_name: "Demo collection",
    license_ccurl: "https://www.bensound.com/licensing"
  },
  {
    id: "demo-2",
    name: "Acoustic Breeze",
    artist_name: "Benjamin Tissot",
    image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=500&h=500&fit=crop",
    audio: "https://www.bensound.com/bensound-music/bensound-acousticbreeze.mp3",
    duration: 157,
    album_name: "Demo collection",
    license_ccurl: "https://www.bensound.com/licensing"
  },
  {
    id: "demo-3",
    name: "Sunny",
    artist_name: "Benjamin Tissot",
    image: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop",
    audio: "https://www.bensound.com/bensound-music/bensound-sunny.mp3",
    duration: 120,
    album_name: "Demo collection",
    license_ccurl: "https://www.bensound.com/licensing"
  },
  {
    id: "demo-4",
    name: "Energy",
    artist_name: "Benjamin Tissot",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&h=500&fit=crop",
    audio: "https://www.bensound.com/bensound-music/bensound-energy.mp3",
    duration: 154,
    album_name: "Demo collection",
    license_ccurl: "https://www.bensound.com/licensing"
  }
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Could not save ${key}`, error);
    showToast("Impossible de sauvegarder les données dans ce navigateur.");
    return false;
  }
}

const state = {
  tracks: [],
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  favorites: new Set(readStorage(STORAGE_KEYS.favorites, [])),
  playlists: readStorage(STORAGE_KEYS.playlists, []),
  currentView: "home",
  currentPlaylistId: null,
  pendingPlaylistTrackId: null,
  currentGenre: "",
  searchQuery: "",
  page: 0,
  hasMore: true,
  loading: false,
  autoplay: true,
  shuffle: false,
  repeat: false,
  history: ["home"],
  historyIndex: 0,
  toastTimer: null
};

const audio = $("#audio-player");

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function normalizeTrack(track) {
  return {
    id: String(track.id),
    name: track.name || "Titre inconnu",
    artist_name: track.artist_name || "Artiste inconnu",
    image: track.image || track.album_image || FALLBACK_COVER,
    audio: track.audio || "",
    duration: Number(track.duration) || 0,
    album_name: track.album_name || "",
    license_ccurl: track.license_ccurl || "",
    shareurl: track.shareurl || ""
  };
}

function mergeTracks(...groups) {
  const result = new Map();

  groups.flat().forEach(track => {
    if (track?.id) result.set(String(track.id), track);
  });

  return [...result.values()];
}

async function fetchJamendoTracks({ search = "", genre = "", page = 0 } = {}) {
  if (!CONFIG.JAMENDO_CLIENT_ID) {
    if (search || genre) {
      return DEMO_TRACKS.filter(track => {
        const matchesSearch = `${track.name} ${track.artist_name}`
          .toLowerCase()
          .includes(search.toLowerCase());
        return matchesSearch;
      }).map(normalizeTrack);
    }

    return DEMO_TRACKS.map(normalizeTrack);
  }

  const params = new URLSearchParams({
    client_id: CONFIG.JAMENDO_CLIENT_ID,
    format: "json",
    limit: String(CONFIG.PAGE_SIZE),
    offset: String(page * CONFIG.PAGE_SIZE),
    order: "popularity_total",
    audioformat: "mp32",
    include: "musicinfo"
  });

  if (search.trim()) params.set("namesearch", search.trim());
  if (genre) params.set("tags", genre);

  const url = `${CONFIG.API_BASE}/tracks/?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Erreur catalogue (${response.status})`);
  }

  const payload = await response.json();

  if (payload.headers?.status === "failed") {
    throw new Error(payload.headers.error_message || "Erreur API Jamendo");
  }

  return (payload.results || [])
    .filter(track => track.audio)
    .map(normalizeTrack);
}

function loadingMarkup(message = "Chargement des morceaux...") {
  return `<div class="loading-state"><span class="spinner"></span><span>${escapeHTML(message)}</span></div>`;
}

function emptyMarkup(icon, title, description, buttonText = "", view = "") {
  const button = buttonText
    ? `<button class="primary-button" data-view="${escapeHTML(view)}">${escapeHTML(buttonText)} ↗</button>`
    : "";

  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(description)}</p>
      ${button}
    </div>
  `;
}

function trackCard(track) {
  const favorite = state.favorites.has(String(track.id));
  const isPlaying = state.currentTrack?.id === track.id && !audio.paused;

  return `
    <article class="track-card ${isPlaying ? "is-playing" : ""}">
      <div class="track-cover-wrap">
        <img
          class="track-cover"
          src="${escapeHTML(track.image)}"
          alt="Pochette de ${escapeHTML(track.name)}"
          loading="lazy"
          data-fallback-cover
        >
        <button class="cover-play" data-play-track="${escapeHTML(track.id)}" aria-label="Lire ${escapeHTML(track.name)}">
          ${isPlaying ? "Ⅱ" : "▶"}
        </button>
      </div>
      <h3 title="${escapeHTML(track.name)}">${escapeHTML(track.name)}</h3>
      <p class="artist">${escapeHTML(track.artist_name)}</p>
      <div class="track-card-footer">
        <span class="track-duration">${formatTime(track.duration)}</span>
        <div class="track-card-actions">
          <button class="playlist-add-button" data-select-playlist-track="${escapeHTML(track.id)}" aria-label="Ajouter ${escapeHTML(track.name)} à une playlist" title="Ajouter à une playlist">＋</button>
          <button class="heart-button ${favorite ? "active" : ""}" data-favorite="${escapeHTML(track.id)}" aria-label="${favorite ? "Retirer des favoris" : "Ajouter aux favoris"}">
            ${favorite ? "♥" : "♡"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function trackRow(track, index) {
  const favorite = state.favorites.has(String(track.id));

  return `
    <div class="track-row">
      <span class="track-number">${String(index + 1).padStart(2, "0")}</span>
      <img class="row-cover" src="${escapeHTML(track.image)}" alt="" loading="lazy" data-fallback-cover>
      <div class="row-info">
        <strong>${escapeHTML(track.name)}</strong>
        <span>${escapeHTML(track.artist_name)}</span>
      </div>
      <span class="row-duration">${formatTime(track.duration)}</span>
      <div class="row-actions">
        <button class="row-heart ${favorite ? "active" : ""}" data-favorite="${escapeHTML(track.id)}" aria-label="Favoris">
          ${favorite ? "♥" : "♡"}
        </button>
        <button class="row-add-playlist" data-select-playlist-track="${escapeHTML(track.id)}" aria-label="Ajouter ${escapeHTML(track.name)} à une playlist" title="Ajouter à une playlist">＋</button>
        <button class="row-play" data-play-track="${escapeHTML(track.id)}" aria-label="Lire">▶</button>
      </div>
    </div>
  `;
}

function renderCards(element, tracks, empty) {
  if (!tracks.length) {
    element.innerHTML = empty;
    return;
  }

  element.innerHTML = tracks.map(trackCard).join("");
}

function renderHome() {
  const tracks = state.tracks;

  renderCards(
    $("#featured-tracks"),
    tracks.slice(0, 4),
    emptyMarkup("♫", "Prépare tes écouteurs", "Charge le catalogue musical pour découvrir de nouveaux morceaux.", "Explorer", "explore")
  );

  $("#trending-tracks").innerHTML = tracks.length
    ? tracks.slice(0, 6).map(trackRow).join("")
    : emptyMarkup("♪", "Rien à écouter pour le moment", "Explore le catalogue pour trouver ton prochain morceau.", "Explorer", "explore");
}

function renderFavorites() {
  const favorites = state.tracks.filter(track => state.favorites.has(String(track.id)));

  // Keep favorite tracks available even when the current catalogue has changed.
  const knownIds = new Set(favorites.map(track => String(track.id)));
  const storedFavoriteTracks = state.favoriteTrackCache || [];

  const allFavorites = mergeTracks(
    favorites,
    storedFavoriteTracks.filter(track => state.favorites.has(String(track.id)) && !knownIds.has(String(track.id)))
  );

  renderCards(
    $("#favorites-results"),
    allFavorites,
    emptyMarkup("♡", "Tes favoris t'attendent", "Appuie sur le cœur d'un morceau pour le retrouver ici.", "Découvrir des sons", "explore")
  );
}

function renderExplore() {
  renderCards(
    $("#explore-results"),
    state.exploreTracks || [],
    emptyMarkup("⌕", "Aucun morceau trouvé", "Essaie un autre genre ou une autre recherche.", "Réinitialiser", "explore")
  );

  $("#load-more").hidden = !state.hasMore || !CONFIG.JAMENDO_CLIENT_ID;
  $("#load-more").disabled = state.loading;
  $("#load-more").textContent = state.loading ? "Chargement..." : "Charger plus de morceaux";
}

function renderPlaylists() {
  const container = $("#playlists-results");

  if (!state.playlists.length) {
    container.innerHTML = emptyMarkup("▤", "Crée ta première playlist", "Rassemble les morceaux qui correspondent à ton humeur.", "Créer une playlist", "");
    const button = container.querySelector("[data-view]");
    if (button) {
      button.removeAttribute("data-view");
      button.id = "empty-create-playlist";
    }
    return;
  }

  container.innerHTML = state.playlists.map(playlist => {
    const count = playlist.trackIds.length;

    return `
      <article class="playlist-card" data-open-playlist="${escapeHTML(playlist.id)}" tabindex="0" role="button" aria-label="Ouvrir ${escapeHTML(playlist.name)}">
        <div class="playlist-art">♫</div>
        <h3>${escapeHTML(playlist.name)}</h3>
        <p>${count} morceau${count > 1 ? "x" : ""}</p>
      </article>
    `;
  }).join("");
}

function renderPlaylistSidebar() {
  const container = $("#sidebar-playlist-list");

  if (!state.playlists.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:11px;padding-left:9px">Aucune playlist</p>';
    return;
  }

  container.innerHTML = state.playlists.map(playlist => `
    <button class="sidebar-playlist" data-open-playlist="${escapeHTML(playlist.id)}">
      <span>♫</span><span>${escapeHTML(playlist.name)}</span>
    </button>
  `).join("");
}

function getTrackById(id) {
  const all = mergeTracks(state.tracks, state.exploreTracks || [], state.favoriteTrackCache || []);
  for (const playlist of state.playlists) {
    for (const track of playlist.tracks || []) all.push(track);
  }
  return all.find(track => String(track.id) === String(id));
}

function renderPlaylistDetail(id) {
  const playlist = state.playlists.find(item => item.id === id);
  const container = $("#playlist-detail-content");

  if (!playlist) {
    navigate("playlists");
    return;
  }

  const tracks = (playlist.trackIds || [])
    .map(trackId => getTrackById(trackId) || (playlist.tracks || []).find(track => String(track.id) === String(trackId)))
    .filter(Boolean);

  container.innerHTML = `
    <div class="playlist-detail-heading">
      <div class="playlist-detail-art">♫</div>
      <div>
        <p class="section-kicker">PLAYLIST PERSONNELLE</p>
        <h1>${escapeHTML(playlist.name)}</h1>
        <p>${tracks.length} morceau${tracks.length > 1 ? "x" : ""}</p>
        <div class="playlist-detail-actions">
          <button class="primary-button" data-play-playlist="${escapeHTML(playlist.id)}">▶ Tout écouter</button>
          <button class="secondary-button" data-delete-playlist="${escapeHTML(playlist.id)}">Supprimer</button>
        </div>
      </div>
    </div>
    <div class="track-list">
      ${tracks.length
        ? tracks.map(trackRow).join("")
        : emptyMarkup("♫", "Cette playlist est vide", "Ajoute des morceaux depuis Explorer.", "Explorer", "explore")}
    </div>
    <div style="margin-top:25px">
      <p class="section-kicker">AJOUTER DES MORCEAUX</p>
      <div class="track-grid" style="margin-top:15px">
        ${mergeTracks(state.tracks, state.exploreTracks || [])
          .filter(track => !playlist.trackIds.includes(String(track.id)))
          .slice(0, 8)
          .map(track => `
            <article class="track-card">
              <div class="track-cover-wrap">
                <img class="track-cover" src="${escapeHTML(track.image)}" alt="" loading="lazy" data-fallback-cover>
                <button class="cover-play" data-add-to-playlist="${escapeHTML(playlist.id)}" data-add-track="${escapeHTML(track.id)}" aria-label="Ajouter à la playlist">＋</button>
              </div>
              <h3>${escapeHTML(track.name)}</h3>
              <p class="artist">${escapeHTML(track.artist_name)}</p>
              <div class="track-card-footer">
                <span class="track-duration">${formatTime(track.duration)}</span>
                <button class="secondary-button" style="min-height:30px;padding:0 9px" data-add-to-playlist="${escapeHTML(playlist.id)}" data-add-track="${escapeHTML(track.id)}">＋ Ajouter</button>
              </div>
            </article>
          `).join("")}
      </div>
    </div>
  `;
}

function renderSearchResults(tracks, query) {
  $("#search-page-title").textContent = `Résultats : ${query}`;
  $("#search-page-subtitle").textContent = `${tracks.length} morceau(x) trouvé(s)`;
  renderCards(
    $("#search-results"),
    tracks,
    emptyMarkup("⌕", "Aucun résultat", "Vérifie l'orthographe ou essaie un autre artiste.", "Explorer", "explore")
  );
}

function navigate(view, { record = true } = {}) {
  const validViews = ["home", "explore", "favorites", "playlists", "playlist-detail", "search"];
  if (!validViews.includes(view)) return;

  state.currentView = view;

  $$(".view").forEach(section => section.classList.remove("active"));
  $(`#view-${view}`)?.classList.add("active");

  $$(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  if (record) {
    const current = state.history[state.historyIndex];
    if (current !== view) {
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(view);
      state.historyIndex = state.history.length - 1;
    }
  }

  if (view === "home") renderHome();
  if (view === "explore") renderExplore();
  if (view === "favorites") renderFavorites();
  if (view === "playlists") renderPlaylists();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function navigateHistory(direction) {
  const nextIndex = state.historyIndex + direction;

  if (nextIndex < 0 || nextIndex >= state.history.length) return;

  state.historyIndex = nextIndex;
  navigate(state.history[nextIndex], { record: false });
}

async function loadInitialTracks() {
  $("#featured-tracks").innerHTML = loadingMarkup();
  $("#trending-tracks").innerHTML = loadingMarkup();

  try {
    const tracks = await fetchJamendoTracks();
    state.tracks = mergeTracks(state.tracks, tracks);
    state.favoriteTrackCache = state.favoriteTrackCache || [];
    renderHome();
    renderFavorites();
    state.exploreTracks = tracks;
    renderExplore();
  } catch (error) {
    console.error(error);
    $("#featured-tracks").innerHTML = emptyMarkup(
      "!", "Catalogue indisponible", "Vérifie ta connexion et ton identifiant Jamendo.",
      "Réessayer", "home"
    );
    $("#trending-tracks").innerHTML = "";
    showToast("Impossible de charger les morceaux.");
  }
}

async function loadExplore({ reset = false } = {}) {
  if (state.loading) return;

  if (reset) {
    state.page = 0;
    state.hasMore = true;
    state.exploreTracks = [];
    $("#explore-results").innerHTML = loadingMarkup();
  }

  state.loading = true;
  renderExplore();

  try {
    const tracks = await fetchJamendoTracks({
      search: state.searchQuery,
      genre: state.currentGenre,
      page: state.page
    });

    state.exploreTracks = mergeTracks(state.exploreTracks || [], tracks);
    state.tracks = mergeTracks(state.tracks, tracks);
    state.hasMore = CONFIG.JAMENDO_CLIENT_ID
      ? tracks.length === CONFIG.PAGE_SIZE
      : false;

    if (CONFIG.JAMENDO_CLIENT_ID) state.page++;

    renderExplore();
    renderFavorites();
  } catch (error) {
    console.error(error);
    $("#explore-results").innerHTML = emptyMarkup(
      "!", "Impossible de charger le catalogue",
      "Vérifie ton identifiant API et ta connexion, puis réessaie.",
      "Réessayer", "explore"
    );
    showToast(error.message || "Erreur de chargement.");
  } finally {
    state.loading = false;
    $("#load-more").disabled = false;
    $("#load-more").textContent = "Charger plus de morceaux";
  }
}

async function searchTracks(query) {
  const normalized = query.trim();
  if (!normalized) {
    showToast("Entre un titre ou un nom d'artiste.");
    return;
  }

  state.searchQuery = normalized;
  navigate("search");
  $("#search-results").innerHTML = loadingMarkup("Recherche musicale...");

  try {
    const results = await fetchJamendoTracks({ search: normalized });
    state.tracks = mergeTracks(state.tracks, results);
    state.exploreTracks = mergeTracks(state.exploreTracks || [], results);
    renderSearchResults(results, normalized);
  } catch (error) {
    console.error(error);
    $("#search-results").innerHTML = emptyMarkup(
      "!", "Recherche indisponible", "Vérifie ta connexion ou la configuration de l'API."
    );
  }
}

function setPlayerArtwork(track) {
  $("#player-cover").src = track.image || FALLBACK_COVER;
  $("#player-cover").onerror = () => {
    $("#player-cover").src = FALLBACK_COVER;
  };
}

async function playTrack(track, queue = null) {
  if (!track?.audio) {
    showToast("Ce morceau ne possède pas de lien audio disponible.");
    return;
  }

  if (queue) {
    state.queue = queue;
    state.queueIndex = queue.findIndex(item => String(item.id) === String(track.id));
  } else {
    const allTracks = mergeTracks(state.tracks, state.exploreTracks || []);
    state.queue = allTracks.length ? allTracks : [track];
    state.queueIndex = state.queue.findIndex(item => String(item.id) === String(track.id));

    if (state.queueIndex < 0) {
      state.queue.push(track);
      state.queueIndex = state.queue.length - 1;
    }
  }

  state.currentTrack = track;
  audio.src = track.audio;
  audio.volume = Number($("#volume-bar").value);
  setPlayerArtwork(track);

  $("#player-title").textContent = track.name;
  $("#player-artist").textContent = track.artist_name;
  $("#duration").textContent = formatTime(track.duration);
  $("#current-time").textContent = "0:00";
  $("#progress-bar").value = 0;
  $("#player-favorite").classList.toggle("active", state.favorites.has(String(track.id)));
  $("#player-favorite").textContent = state.favorites.has(String(track.id)) ? "♥" : "♡";
  $("#play-button").textContent = "Ⅱ";
  $("#play-button").setAttribute("aria-label", "Pause");

  try {
    await audio.play();
    renderHome();
    renderExplore();
    showToast(`Lecture : ${track.name}`);
  } catch (error) {
    console.error(error);
    $("#play-button").textContent = "▶";
    $("#play-button").setAttribute("aria-label", "Lire");
    showToast("Lecture impossible. Le lien audio est peut-être indisponible.");
  }
}

async function togglePlayback() {
  if (!state.currentTrack) {
    const firstTrack = state.tracks.find(track => track.audio);
    if (firstTrack) {
      await playTrack(firstTrack);
    } else {
      showToast("Aucun morceau disponible pour le moment.");
    }
    return;
  }

  if (audio.paused) {
    try {
      await audio.play();
    } catch (error) {
      console.error(error);
      showToast("Impossible de reprendre la lecture.");
    }
  } else {
    audio.pause();
  }
}

async function playNext() {
  if (!state.queue.length) return;

  if (state.repeat) {
    audio.currentTime = 0;
    await audio.play().catch(() => {});
    return;
  }

  let nextIndex;

  if (state.shuffle && state.queue.length > 1) {
    do {
      nextIndex = Math.floor(Math.random() * state.queue.length);
    } while (nextIndex === state.queueIndex);
  } else {
    nextIndex = state.queueIndex + 1;
  }

  if (nextIndex >= state.queue.length) {
    if (!state.autoplay) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    nextIndex = 0;
  }

  const nextTrack = state.queue[nextIndex];
  if (nextTrack) await playTrack(nextTrack, state.queue);
}

async function playPrevious() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  if (!state.queue.length) return;

  const previousIndex = state.queueIndex - 1;
  const index = previousIndex < 0 ? state.queue.length - 1 : previousIndex;

  await playTrack(state.queue[index], state.queue);
}

function toggleFavorite(trackId) {
  const id = String(trackId);
  const track = getTrackById(id);

  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    showToast("Retiré des favoris.");
  } else {
    state.favorites.add(id);
    if (track) {
      state.favoriteTrackCache = mergeTracks(state.favoriteTrackCache || [], [track]);
    }
    showToast("Ajouté aux favoris ♡");
  }

  writeStorage(STORAGE_KEYS.favorites, [...state.favorites]);
  writeStorage("sonora:favorite-tracks:v1", state.favoriteTrackCache || []);

  $("#player-favorite").classList.toggle("active", state.favorites.has(id));
  $("#player-favorite").textContent = state.favorites.has(id) ? "♥" : "♡";

  renderHome();
  renderExplore();
  renderFavorites();

  if (state.currentView === "playlist-detail") {
    renderPlaylistDetail(state.currentPlaylistId);
  }
}

function createPlaylist(name) {
  const cleanName = name.trim();

  if (!cleanName) {
    showToast("Donne un nom à ta playlist.");
    return;
  }

  const duplicate = state.playlists.some(
    playlist => playlist.name.toLowerCase() === cleanName.toLowerCase()
  );

  if (duplicate) {
    showToast("Une playlist porte déjà ce nom.");
    return;
  }

  const playlist = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    name: cleanName,
    trackIds: [],
    tracks: [],
    createdAt: new Date().toISOString()
  };

  state.playlists.push(playlist);
  writeStorage(STORAGE_KEYS.playlists, state.playlists);
  renderPlaylists();
  renderPlaylistSidebar();
  $("#playlist-dialog").close();
  $("#playlist-name").value = "";
  const pendingTrackId = state.pendingPlaylistTrackId;
  state.pendingPlaylistTrackId = null;
  if (pendingTrackId) {
    addTrackToPlaylist(playlist.id, pendingTrackId);
  } else {
    showToast("Playlist créée avec succès !");
  }
  navigate("playlists");
}

function addTrackToPlaylist(playlistId, trackId) {
  const playlist = state.playlists.find(item => item.id === playlistId);
  const track = getTrackById(trackId);

  if (!playlist || !track) {
    showToast("Impossible de retrouver ce morceau.");
    return;
  }

  if (playlist.trackIds.includes(String(trackId))) {
    showToast("Ce morceau est déjà dans la playlist.");
    return;
  }

  playlist.trackIds.push(String(trackId));
  playlist.tracks = mergeTracks(playlist.tracks || [], [track]);
  writeStorage(STORAGE_KEYS.playlists, state.playlists);
  renderPlaylistSidebar();
  renderPlaylistDetail(playlistId);
  showToast("Morceau ajouté à la playlist !");
}

async function playPlaylist(playlistId) {
  const playlist = state.playlists.find(item => item.id === playlistId);
  if (!playlist) return;

  const tracks = playlist.trackIds
    .map(id => getTrackById(id) || (playlist.tracks || []).find(track => String(track.id) === String(id)))
    .filter(track => track?.audio);

  if (!tracks.length) {
    showToast("Ajoute d'abord des morceaux à cette playlist.");
    return;
  }

  await playTrack(tracks[0], tracks);
}

function deletePlaylist(playlistId) {
  const playlist = state.playlists.find(item => item.id === playlistId);
  if (!playlist) return;

  if (!confirm(`Supprimer la playlist « ${playlist.name} » ?`)) return;

  state.playlists = state.playlists.filter(item => item.id !== playlistId);
  writeStorage(STORAGE_KEYS.playlists, state.playlists);
  renderPlaylistSidebar();
  renderPlaylists();
  showToast("Playlist supprimée.");
  navigate("playlists");
}

function openPlaylist(playlistId) {
  state.currentPlaylistId = playlistId;
  renderPlaylistDetail(playlistId);
  navigate("playlist-detail");
}

function openPlaylistDialog() {
  $("#playlist-dialog").showModal();
  $("#playlist-name").focus();
}

function openAddTrackDialog(trackId) {
  const track = getTrackById(trackId);
  if (!track) {
    showToast("Impossible de retrouver ce morceau.");
    return;
  }

  state.pendingPlaylistTrackId = String(trackId);
  const select = $("#add-track-playlist");
  const hasPlaylists = state.playlists.length > 0;
  select.innerHTML = state.playlists.map(playlist =>
    `<option value="${escapeHTML(playlist.id)}">${escapeHTML(playlist.name)}</option>`
  ).join("");
  $("#add-track-playlist-options").hidden = !hasPlaylists;
  $("#add-track-no-playlists").hidden = hasPlaylists;
  $("#add-track-dialog-actions").hidden = !hasPlaylists;
  $("#add-track-dialog").showModal();
}

function updateProgress() {
  const duration = audio.duration || state.currentTrack?.duration || 0;
  const current = audio.currentTime || 0;

  $("#current-time").textContent = formatTime(current);

  if (audio.duration && Number.isFinite(audio.duration)) {
    $("#duration").textContent = formatTime(audio.duration);
    $("#progress-bar").value = (current / audio.duration) * 100;
  } else {
    $("#progress-bar").value = 0;
    $("#duration").textContent = formatTime(duration);
  }
}

function bindEvents() {
  document.addEventListener("click", async event => {
    const target = event.target.closest("button, [data-open-playlist]");
    if (!target) return;

    if (target.dataset.view) {
      navigate(target.dataset.view);
      if (target.dataset.view === "explore" && !state.exploreTracks?.length) {
        await loadExplore({ reset: true });
      }
      return;
    }

    if (target.dataset.playTrack) {
      const track = getTrackById(target.dataset.playTrack);
      if (track) await playTrack(track);
      else showToast("Ce morceau n'est plus disponible.");
      return;
    }

    if (target.dataset.favorite) {
      toggleFavorite(target.dataset.favorite);
      return;
    }

    if (target.dataset.selectPlaylistTrack) {
      openAddTrackDialog(target.dataset.selectPlaylistTrack);
      return;
    }

    if (target.dataset.openPlaylist) {
      openPlaylist(target.dataset.openPlaylist);
      return;
    }

    if (target.dataset.addToPlaylist) {
      addTrackToPlaylist(target.dataset.addToPlaylist, target.dataset.addTrack);
      return;
    }

    if (target.dataset.playPlaylist) {
      await playPlaylist(target.dataset.playPlaylist);
      return;
    }

    if (target.dataset.deletePlaylist) {
      deletePlaylist(target.dataset.deletePlaylist);
      return;
    }

    if (target.id === "empty-create-playlist" ||
        target.id === "create-playlist-main" ||
        target.id === "create-playlist-sidebar") {
      openPlaylistDialog();
      return;
    }

    if (target.id === "play-button") {
      await togglePlayback();
      return;
    }

    if (target.id === "next-button") {
      await playNext();
      return;
    }

    if (target.id === "previous-button") {
      await playPrevious();
      return;
    }

    if (target.id === "shuffle-button") {
      state.shuffle = !state.shuffle;
      target.classList.toggle("active", state.shuffle);
      showToast(state.shuffle ? "Lecture aléatoire activée." : "Lecture aléatoire désactivée.");
      return;
    }

    if (target.id === "repeat-button") {
      state.repeat = !state.repeat;
      target.classList.toggle("active", state.repeat);
      showToast(state.repeat ? "Répétition activée." : "Répétition désactivée.");
      return;
    }

    if (target.id === "autoplay-button") {
      state.autoplay = !state.autoplay;
      target.classList.toggle("active", state.autoplay);
      target.setAttribute("aria-label", state.autoplay ? "Désactiver la lecture automatique" : "Activer la lecture automatique");
      showToast(state.autoplay ? "Lecture automatique activée." : "Lecture automatique désactivée.");
      return;
    }

    if (target.id === "player-favorite" && state.currentTrack) {
      toggleFavorite(state.currentTrack.id);
      return;
    }

    if (target.id === "back-button") {
      navigateHistory(-1);
      return;
    }

    if (target.id === "forward-button") {
      navigateHistory(1);
      return;
    }

    if (target.id === "close-dialog" || target.id === "cancel-dialog") {
      $("#playlist-dialog").close();
      return;
    }

    if (target.id === "close-add-track-dialog" || target.id === "cancel-add-track-dialog") {
      $("#add-track-dialog").close();
      state.pendingPlaylistTrackId = null;
      return;
    }

    if (target.id === "create-playlist-from-picker") {
      $("#add-track-dialog").close();
      openPlaylistDialog();
      return;
    }

    if (target.classList.contains("genre-chip")) {
      $$(".genre-chip").forEach(button => button.classList.remove("active"));
      target.classList.add("active");
      state.currentGenre = target.dataset.genre || "";
      state.searchQuery = "";
      await loadExplore({ reset: true });
    }
  });

  // Make playlist cards accessible by keyboard.
  document.addEventListener("keydown", event => {
    const card = event.target.closest("[data-open-playlist]");
    if (card && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openPlaylist(card.dataset.openPlaylist);
    }
  });

  $("#playlist-form").addEventListener("submit", event => {
    event.preventDefault();
    createPlaylist($("#playlist-name").value);
  });

  $("#add-track-form").addEventListener("submit", event => {
    event.preventDefault();
    const trackId = state.pendingPlaylistTrackId;
    const playlistId = $("#add-track-playlist").value;
    if (!trackId || !playlistId) return;

    state.pendingPlaylistTrackId = null;
    $("#add-track-dialog").close();
    addTrackToPlaylist(playlistId, trackId);
  });

  $("#search-form").addEventListener("submit", async event => {
    event.preventDefault();
    await searchTracks($("#search-input").value);
  });

  $("#load-more").addEventListener("click", async () => {
    await loadExplore();
  });

  $("#progress-bar").addEventListener("input", event => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = (Number(event.target.value) / 100) * audio.duration;
    }
  });

  $("#volume-bar").addEventListener("input", event => {
    audio.volume = Number(event.target.value);
    writeStorage(STORAGE_KEYS.volume, audio.volume);
  });

  audio.addEventListener("timeupdate", updateProgress);

  audio.addEventListener("loadedmetadata", () => {
    $("#duration").textContent = formatTime(audio.duration);
    updateProgress();
  });

  audio.addEventListener("play", () => {
    $("#play-button").textContent = "Ⅱ";
    $("#play-button").setAttribute("aria-label", "Pause");
  });

  audio.addEventListener("pause", () => {
    $("#play-button").textContent = "▶";
    $("#play-button").setAttribute("aria-label", "Lire");
  });

  audio.addEventListener("ended", async () => {
    if (state.repeat) {
      audio.currentTime = 0;
      await audio.play().catch(() => {});
    } else if (state.autoplay) {
      await playNext();
    } else {
      $("#play-button").textContent = "▶";
    }
  });

  audio.addEventListener("error", () => {
    if (state.currentTrack) {
      showToast("Le flux audio est indisponible. Essaie un autre morceau.");
    }
  });

  $("#profile-button").addEventListener("click", () => {
    showToast("SONORA — ton espace musical personnel.");
  });

  $("#playlist-dialog").addEventListener("click", event => {
    if (event.target === $("#playlist-dialog")) {
      $("#playlist-dialog").close();
    }
  });

  $("#playlist-dialog").addEventListener("close", () => {
    state.pendingPlaylistTrackId = null;
  });

  $("#add-track-dialog").addEventListener("click", event => {
    if (event.target === $("#add-track-dialog")) {
      $("#add-track-dialog").close();
      state.pendingPlaylistTrackId = null;
    }
  });

  $("#add-track-dialog").addEventListener("cancel", () => {
    state.pendingPlaylistTrackId = null;
  });

  document.addEventListener("error", event => {
    const img = event.target;
    if (img instanceof HTMLImageElement && img.hasAttribute("data-fallback-cover")) {
      img.src = FALLBACK_COVER;
      img.removeAttribute("data-fallback-cover");
    }
  }, true);

  document.addEventListener("keydown", event => {
    const tag = document.activeElement?.tagName;
    const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);

    if (isTyping || event.altKey || event.ctrlKey || event.metaKey) return;

    if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
    }

    if (event.code === "ArrowRight" && state.currentTrack && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(audio.currentTime + 5, audio.duration);
    }

    if (event.code === "ArrowLeft" && state.currentTrack) {
      audio.currentTime = Math.max(audio.currentTime - 5, 0);
    }
  });

  $("#back-button").addEventListener("click", () => navigateHistory(-1));
  $("#forward-button").addEventListener("click", () => navigateHistory(1));
}

function init() {
  state.favoriteTrackCache = readStorage("sonora:favorite-tracks:v1", []);

  const savedVolume = readStorage(STORAGE_KEYS.volume, 0.75);
  $("#volume-bar").value = savedVolume;
  audio.volume = savedVolume;

  renderPlaylistSidebar();
  bindEvents();
  loadInitialTracks();
}

document.addEventListener("DOMContentLoaded", init);
