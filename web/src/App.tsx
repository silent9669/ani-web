import Hls from "hls.js";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Film,
  Loader2,
  Maximize,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  Search,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Star,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { animeKey, api, favoriteToAnime } from "./api";
import type { Anime, AnimeDetails, Episode, Favorite, PlayerContext, Source, WatchHistory } from "./types";

const SOURCE_STORAGE_KEY = "ani-desk:selected-source";
const EPISODE_RANGE_SIZE = 50;
const LOGO_SRC = "/logo.png";
const fadeUpVariant = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

type Route = "home" | "my-list" | "continue" | "search" | "detail";
type QualityLevel = { index: number; label: string };
type ShelfSort = "recent" | "title" | "provider";

function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Anime[]>([]);
  const [searchSelection, setSearchSelection] = useState<Anime | null>(null);
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [continueWatching, setContinueWatching] = useState<WatchHistory[]>([]);
  const [myList, setMyList] = useState<Favorite[]>([]);
  const [player, setPlayer] = useState<PlayerContext | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>("home");
  const [routeStack, setRouteStack] = useState<Route[]>([]);
  const detailCacheRef = useRef<Record<string, Partial<Anime>>>({});

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const root = document.documentElement;
    root.classList.toggle("platform-macos", userAgent.includes("mac"));
    root.classList.toggle("platform-windows", userAgent.includes("win"));
    root.classList.toggle("platform-linux", userAgent.includes("linux"));
  }, []);

  useEffect(() => {
    if (route !== "search") return;
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      setResults([]);
      setSearchSelection(null);
      return;
    }

    const handle = window.setTimeout(() => {
      void search(cleanQuery, selectedSource);
    }, 320);

    return () => window.clearTimeout(handle);
  }, [query, route, selectedSource]);

  useEffect(() => {
    if (route !== "search" || !searchSelection) return;
    void enrichAnime(searchSelection);
  }, [route, searchSelection?.provider, searchSelection?.id]);

  async function bootstrap() {
    try {
      const [sourceList, history, favorites] = await Promise.all([
        api.listSources(),
        api.getContinueWatching(200),
        api.getMyList(300),
      ]);
      const savedSourceName = loadSavedSourceName();
      const nextSource = sourceList.find((source) => source.name === savedSourceName) ?? sourceList[0] ?? null;

      setSources(sourceList);
      setSelectedSource(nextSource);
      if (nextSource) saveSourceName(nextSource.name);
      setContinueWatching(history);
      setMyList(favorites);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBootstrapping(false);
    }
  }

  async function refreshShelfData() {
    const [history, favorites] = await Promise.all([
      api.getContinueWatching(200),
      api.getMyList(300),
    ]);
    setContinueWatching(history);
    setMyList(favorites);
  }

  function navigate(nextRoute: Route) {
    if (nextRoute === route) return;
    setRouteStack((stack) => [...stack, route]);
    setRoute(nextRoute);
    setError(null);
  }

  function goBack() {
    const currentRoute = route;
    setRouteStack((stack) => {
      const nextStack = [...stack];
      const previous = nextStack.pop();
      setRoute(previous ?? "home");
      setError(null);
      if (currentRoute === "detail") {
        setSelectedAnime(null);
        setEpisodes([]);
      }
      return nextStack;
    });
  }

  function selectSource(source: Source) {
    setSelectedSource(source);
    saveSourceName(source.name);
    if (query.trim().length >= 2) void search(query, source);
  }

  function openSearch() {
    if (route !== "search") navigate("search");
  }

  async function search(nextQuery = query, source = selectedSource) {
    if (!source) {
      setError("No sources are enabled. Check your ani-desk config.");
      return;
    }

    const cleanQuery = nextQuery.trim();
    if (cleanQuery.length < 2) {
      setResults([]);
      setSearchSelection(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const items = await api.searchSource(source.name, cleanQuery);
      setResults(items);
      setSearchSelection((current) => {
        if (current && items.some((item) => animeKey(item.provider, item.id) === animeKey(current.provider, current.id))) {
          return current;
        }
        return items[0] ?? null;
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function enrichAnime(anime: Anime): Promise<Anime> {
    const key = animeKey(anime.provider, anime.id);
    const cached = detailCacheRef.current[key];
    if (cached) return mergeAnimeDetails(anime, cached);

    try {
      const details = await api.getAnimeDetails(anime.provider, anime.id, anime.title);
      const patch = detailPatch(details);
      detailCacheRef.current[key] = patch;
      if (Object.keys(patch).length) mergeAnimeEverywhere(key, patch);
      return mergeAnimeDetails(anime, patch);
    } catch {
      detailCacheRef.current[key] = {};
      return anime;
    }
  }

  function mergeAnimeEverywhere(key: string, patch: Partial<Anime>) {
    setResults((items) =>
      items.map((item) => (animeKey(item.provider, item.id) === key ? mergeAnimeDetails(item, patch) : item)),
    );
    setSearchSelection((anime) =>
      anime && animeKey(anime.provider, anime.id) === key ? mergeAnimeDetails(anime, patch) : anime,
    );
    setSelectedAnime((anime) =>
      anime && animeKey(anime.provider, anime.id) === key ? mergeAnimeDetails(anime, patch) : anime,
    );
  }

  async function openAnime(anime: Anime) {
    setSelectedAnime(anime);
    setEpisodes([]);
    setLoadingEpisodes(true);
    setError(null);
    if (route !== "detail") navigate("detail");
    void enrichAnime(anime);
    try {
      setEpisodes(await api.getEpisodes(anime.provider, anime.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingEpisodes(false);
    }
  }

  async function openHistoryItem(item: WatchHistory) {
    await openAnime(historyToAnime(item, myList));
  }

  async function toggleMyList(anime: Anime) {
    const key = animeKey(anime.provider, anime.id);
    try {
      if (anime.isFavorite || myList.some((item) => item.animeId === key)) {
        await api.removeFromMyList(key);
        setMyList((items) => items.filter((item) => item.animeId !== key));
        markFavorite(key, false);
      } else {
        await api.addToMyList(anime);
        await refreshShelfData();
        markFavorite(key, true);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeFromMyList(anime: Anime) {
    const key = animeKey(anime.provider, anime.id);
    try {
      await api.removeFromMyList(key);
      setMyList((items) => items.filter((item) => item.animeId !== key));
      markFavorite(key, false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeHistoryItem(item: WatchHistory) {
    try {
      await api.removeContinueWatching(item.animeId);
      setContinueWatching((items) => items.filter((current) => current.animeId !== item.animeId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function markFavorite(key: string, isFavorite: boolean) {
    setResults((items) =>
      items.map((item) =>
        animeKey(item.provider, item.id) === key ? { ...item, isFavorite } : item,
      ),
    );
    setSearchSelection((anime) =>
      anime && animeKey(anime.provider, anime.id) === key ? { ...anime, isFavorite } : anime,
    );
    setSelectedAnime((anime) =>
      anime && animeKey(anime.provider, anime.id) === key ? { ...anime, isFavorite } : anime,
    );
  }

  async function playEpisode(anime: Anime, episode: Episode, startTime = 0, episodeList = episodes) {
    setError(null);
    try {
      const playback = await api.preparePlayback(anime.provider, episode.id);
      setPlayer({ anime, episode, episodes: episodeList, playback, startTime });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const savedAnime = useMemo(() => myList.map(favoriteToAnime), [myList]);
  const latestHistory = continueWatching[0] ?? null;
  const featuredAnime = latestHistory ? historyToAnime(latestHistory, myList) : savedAnime[0] ?? null;
  const heroImage =
    selectedAnime?.bannerUrl ||
    selectedAnime?.coverUrl ||
    searchSelection?.bannerUrl ||
    searchSelection?.coverUrl ||
    featuredAnime?.bannerUrl ||
    featuredAnime?.coverUrl;
  const selectedAnimeIsFavorite = selectedAnime
    ? selectedAnime.isFavorite || myList.some((item) => item.animeId === animeKey(selectedAnime.provider, selectedAnime.id))
    : false;
  const resumeHistory = selectedAnime ? findHistoryForAnime(selectedAnime, continueWatching) : undefined;

  if (bootstrapping) {
    return <BootSplash />;
  }

  return (
    <div className={`app-shell route-${route}`}>
      <div
        className="ambient-backdrop"
        style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
      />

      <main>
        {error && <div className="error-banner">{error}</div>}

        <AnimatePresence mode="wait">
          {route === "home" && (
            <motion.div key="home" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <HomeDashboard
                query={query}
                loading={loading}
                sources={sources}
                selectedSource={selectedSource}
                onOpenSearch={openSearch}
                continueItems={continueWatching.slice(0, 10)}
                continueTotal={continueWatching.length}
                savedAnime={savedAnime.slice(0, 10)}
                savedTotal={savedAnime.length}
                onSourceSelect={selectSource}
                onResumeHistory={(item) => void openHistoryItem(item)}
                onOpenAnime={(anime) => void openAnime(anime)}
                onShowHistory={continueWatching.length ? () => navigate("continue") : undefined}
                onShowMyList={() => navigate("my-list")}
                myList={myList}
                onToggleFavorite={toggleMyList}
                onRemoveHistory={(item) => void removeHistoryItem(item)}
              />
            </motion.div>
          )}

          {route === "continue" && (
            <HistoryPage
              key="continue"
              items={continueWatching}
              onOpen={(item) => void openHistoryItem(item)}
              onRemove={(item) => void removeHistoryItem(item)}
              onBack={goBack}
              myList={myList}
              onToggleFavorite={(item) => toggleMyList(historyToAnime(item, myList))}
            />
          )}

          {route === "my-list" && (
            <MyListPage
              key="my-list"
              items={savedAnime}
              onOpen={(anime) => void openAnime(anime)}
              onRemove={(anime) => void removeFromMyList(anime)}
              onBack={goBack}
            />
          )}

          {route === "search" && (
            <SearchStage
              key="search"
              query={query}
              results={results}
              loading={loading}
              sources={sources}
              selectedSource={selectedSource}
              selectedAnime={searchSelection}
              onQueryChange={setQuery}
              onSearch={() => void search()}
              onSourceSelect={selectSource}
              onSelectAnime={setSearchSelection}
              onOpenAnime={(anime) => void openAnime(anime)}
              onToggleMyList={(anime) => void toggleMyList(anime)}
              onBack={goBack}
            />
          )}

          {route === "detail" && selectedAnime && (
            <DetailPage
              key={animeKey(selectedAnime.provider, selectedAnime.id)}
              anime={selectedAnime}
              episodes={episodes}
              loading={loadingEpisodes}
              isFavorite={selectedAnimeIsFavorite}
              resumeHistory={resumeHistory}
              onBack={goBack}
              onToggleMyList={() => void toggleMyList(selectedAnime)}
              onPlay={(episode, startTime) => void playEpisode(selectedAnime, episode, startTime)}
            />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {player && (
          <VideoPlayer
            key="video-player"
            context={player}
            onClose={() => {
              setPlayer(null);
              void refreshShelfData();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BootSplash() {
  return (
    <div className="boot-screen">
      <motion.img
        src={LOGO_SRC}
        alt="ani-desk"
        initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
        animate={{ opacity: 1, scale: [0.9, 1.03, 1], rotate: 0 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />
      <motion.div
        className="boot-progress"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
      />
    </div>
  );
}

function HomeDashboard({
  query,
  loading,
  sources,
  selectedSource,
  onOpenSearch,
  continueItems,
  continueTotal,
  savedAnime,
  savedTotal,
  onSourceSelect,
  onResumeHistory,
  onOpenAnime,
  onShowHistory,
  onShowMyList,
  myList,
  onToggleFavorite,
  onRemoveHistory,
}: {
  query: string;
  loading: boolean;
  sources: Source[];
  selectedSource: Source | null;
  onOpenSearch: () => void;
  continueItems: WatchHistory[];
  continueTotal: number;
  savedAnime: Anime[];
  savedTotal: number;
  onSourceSelect: (source: Source) => void;
  onResumeHistory: (item: WatchHistory) => void;
  onOpenAnime: (anime: Anime) => void;
  onShowHistory?: () => void;
  onShowMyList?: () => void;
  myList: Favorite[];
  onToggleFavorite: (anime: Anime) => void;
  onRemoveHistory: (item: WatchHistory) => void;
}) {
  return (
    <section className="home-dashboard">
      <img className="search-stage-watermark" src={LOGO_SRC} alt="" aria-hidden="true" />
      <motion.div
        className="home-command-center"
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0, scale: 0.985 },
          show: {
            opacity: 1,
            scale: 1,
            transition: { duration: 0.3, ease: "easeOut", staggerChildren: 0.055 },
          },
        }}
      >
        <motion.div className="home-command-brand" variants={fadeUpVariant}>
          <img className="home-command-logo" src={LOGO_SRC} alt="ani-desk" />
          <div>
            <span>ani-desk</span>
            <small>{selectedSource ? `${selectedSource.name} / ${selectedSource.language}` : "Pick a provider"}</small>
          </div>
        </motion.div>
        <motion.div className="home-command-actions" variants={fadeUpVariant}>
          <motion.button layoutId="app-search-shell" className="hero-search-trigger home-command-search" onClick={onOpenSearch}>
            <Search size={20} />
            <span>{query.trim() || "Search anime, films, OVAs..."}</span>
            {loading ? <Loader2 className="spin" size={18} /> : <ChevronRight size={19} />}
          </motion.button>
          <ProviderChips sources={sources} selected={selectedSource} onSelect={onSourceSelect} />
        </motion.div>
      </motion.div>

      {continueItems.length === 0 && savedAnime.length === 0 ? null : (
        <div className="dashboard-shelves">
          <ContinueWatchingRow
            items={continueItems}
            total={continueTotal}
            onOpen={onResumeHistory}
            onShowMore={onShowHistory}
            myList={myList}
            onToggleFavorite={(item) => onToggleFavorite(historyToAnime(item, myList))}
            onRemove={onRemoveHistory}
          />
          <AnimeRow
            title="My List"
            items={savedAnime}
            total={savedTotal}
            onOpen={onOpenAnime}
            onShowMore={onShowMyList}
            myList={myList}
            onToggleFavorite={onToggleFavorite}
            onRemove={onToggleFavorite}
            emptyTitle="Your list is empty"
            emptySubtitle="Search and add titles to keep them here."
          />
        </div>
      )}
    </section>
  );
}

function ProviderChips({
  sources,
  selected,
  onSelect,
}: {
  sources: Source[];
  selected: Source | null;
  onSelect: (source: Source) => void;
}) {
  if (!sources.length) return <p className="source-empty">No providers enabled.</p>;

  return (
    <div className="provider-strip" aria-label="Search providers">
      {sources.map((source) => (
        <button
          key={source.name}
          className={selected?.name === source.name ? "provider-chip active" : "provider-chip"}
          onClick={() => onSelect(source)}
        >
          <strong>{source.name}</strong>
          <span>{source.language}</span>
        </button>
      ))}
    </div>
  );
}

function ContinueWatchingRow({
  items,
  total,
  onOpen,
  onShowMore,
  myList,
  onToggleFavorite,
  onRemove,
}: {
  items: WatchHistory[];
  total: number;
  onOpen: (item: WatchHistory) => void;
  onShowMore?: () => void;
  myList: Favorite[];
  onToggleFavorite: (item: WatchHistory) => void;
  onRemove: (item: WatchHistory) => void;
}) {
  return (
    <motion.section className="content-row" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
      <RowHeading title="Continue Watching" total={total} onShowMore={onShowMore} />
      <div className="card-row">
        {items.length ? (
          items.map((item) => (
            <HistoryCard
              item={item}
              key={item.animeId}
              onOpen={onOpen}
              isFavorite={myList.some((fav) => fav.animeId === item.animeId)}
              onToggleFavorite={onToggleFavorite}
              onRemove={onRemove}
            />
          ))
        ) : (
          <ShelfEmptyCard title="Nothing to resume" subtitle="Start an episode and it will appear here." />
        )}
      </div>
    </motion.section>
  );
}

function AnimeRow({
  title,
  items,
  total,
  loading,
  onOpen,
  onShowMore,
  myList,
  onToggleFavorite,
  onRemove,
  emptyTitle = "Nothing here yet",
  emptySubtitle = "Search anime and add a title.",
}: {
  title: string;
  items: Anime[];
  total?: number;
  loading?: boolean;
  onOpen: (anime: Anime) => void;
  onShowMore?: () => void;
  myList: Favorite[];
  onToggleFavorite: (anime: Anime) => void;
  onRemove?: (anime: Anime) => void;
  emptyTitle?: string;
  emptySubtitle?: string;
}) {
  return (
    <motion.section className="content-row" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, delay: 0.04 }}>
      <RowHeading title={title} total={total ?? items.length} onShowMore={onShowMore} />
      <div className="card-row">
        {loading
          ? Array.from({ length: 8 }).map((_, index) => <div className="poster-card skeleton" key={index} />)
          : items.length
            ? items.map((anime) => (
              <AnimeCard
                anime={anime}
                key={`${anime.provider}:${anime.id}`}
                onOpen={onOpen}
                isFavorite={myList.some((fav) => fav.animeId === animeKey(anime.provider, anime.id))}
                onToggleFavorite={onToggleFavorite}
                onRemove={onRemove}
              />
            ))
            : <ShelfEmptyCard title={emptyTitle} subtitle={emptySubtitle} />}
      </div>
    </motion.section>
  );
}

function ShelfEmptyCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="shelf-empty-card">
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

function RowHeading({ title, total, onShowMore }: { title: string; total?: number; onShowMore?: () => void }) {
  return (
    <div className="row-heading">
      <h2>{title}</h2>
      {onShowMore && (
        <button onClick={onShowMore}>
          Show More{total ? ` (${total})` : ""}
          <ChevronRight size={17} />
        </button>
      )}
    </div>
  );
}

function SearchStage({
  query,
  results,
  loading,
  sources,
  selectedSource,
  selectedAnime,
  onQueryChange,
  onSearch,
  onSourceSelect,
  onSelectAnime,
  onOpenAnime,
  onToggleMyList,
  onBack,
}: {
  query: string;
  results: Anime[];
  loading: boolean;
  sources: Source[];
  selectedSource: Source | null;
  selectedAnime: Anime | null;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onSourceSelect: (source: Source) => void;
  onSelectAnime: (anime: Anime) => void;
  onOpenAnime: (anime: Anime) => void;
  onToggleMyList: (anime: Anime) => void;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewImage = selectedAnime?.bannerUrl || selectedAnime?.coverUrl || LOGO_SRC;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <motion.section
      className="search-stage"
      initial={{ opacity: 0, scale: 0.985, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.99, y: -14 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
    >
      <img className="search-stage-watermark" src={LOGO_SRC} alt="" aria-hidden="true" />
      <div className="search-command-panel">
        <div className="search-header">
          <IconButton label="Back" onClick={onBack}>
            <ArrowLeft size={21} />
          </IconButton>
          <motion.div layoutId="app-search-shell" className="search-input-shell">
            <Search size={20} />
            <input
              ref={inputRef}
              value={query}
              placeholder="Search anime..."
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
            />
            {loading && <Loader2 className="spin" size={19} />}
          </motion.div>
        </div>
        <div className="search-source-row">
          <span>Source</span>
          <ProviderChips sources={sources} selected={selectedSource} onSelect={onSourceSelect} />
        </div>
      </div>

      {query.trim().length >= 2 && (
        <div className="search-layout">
          <aside className="search-results-pane">
            <div className="pane-title">
              <span>{selectedSource?.name ?? "Source"}</span>
              <strong>{results.length}</strong>
            </div>
            {loading && !results.length ? (
              Array.from({ length: 9 }).map((_, index) => <div className="result-skeleton" key={index} />)
            ) : results.length ? (
              results.map((anime, index) => {
                const active = selectedAnime && animeKey(anime.provider, anime.id) === animeKey(selectedAnime.provider, selectedAnime.id);
                return (
                  <motion.button
                    className={active ? "search-result active" : "search-result"}
                    key={`${anime.provider}:${anime.id}`}
                    onClick={() => onSelectAnime(anime)}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 30,
                      delay: Math.min(index * 0.012, 0.12)
                    }}
                    whileHover={{ x: 2, y: -1 }}
                  >
                    <img src={anime.coverUrl || LOGO_SRC} alt="" />
                    <span>{anime.title}</span>
                    <small>{anime.provider} / {anime.language}</small>
                  </motion.button>
                );
              })
            ) : (
              <EmptyPanel title={query.trim().length < 2 ? "ani-desk" : "No results"} compact />
            )}
          </aside>

          <AnimatePresence mode="wait">
            <motion.div
              className="search-preview"
              key={selectedAnime ? animeKey(selectedAnime.provider, selectedAnime.id) : "empty"}
              initial={{ opacity: 0, scale: 0.985, x: 18 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.99, x: -18 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {selectedAnime ? (
                <>
                  <div className="preview-art" style={{ backgroundImage: `url(${previewImage})` }} />
                  <img className="preview-poster-fallback" src={selectedAnime.coverUrl || LOGO_SRC} alt="" />
                  <div className="preview-copy">
                    <p className="eyebrow">{selectedAnime.provider} / {selectedAnime.language}</p>
                    <h1>{selectedAnime.title}</h1>
                    <p>{selectedAnime.synopsis || "Description is loaded from the selected provider when available."}</p>
                    <div className="preview-meta">
                      <span><Film size={16} /> {selectedAnime.totalEpisodes ? `${selectedAnime.totalEpisodes} episodes` : "Episodes available"}</span>
                      <span><SlidersHorizontal size={16} /> {selectedSource?.name ?? selectedAnime.provider}</span>
                    </div>
                    <div className="detail-actions">
                      <button className="primary" onClick={() => onOpenAnime(selectedAnime)}>
                        <Play size={18} />
                        Open
                      </button>
                      <button onClick={() => onToggleMyList(selectedAnime)}>
                        {selectedAnime.isFavorite ? (
                          <Star size={18} fill="var(--red)" style={{ color: "var(--red)" }} />
                        ) : (
                          <Star size={18} style={{ color: "var(--red)" }} />
                        )}
                        {selectedAnime.isFavorite ? "In My List" : "My List"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyPanel title="ani-desk" />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </motion.section>
  );
}

function HistoryPage({
  items,
  onOpen,
  onRemove,
  onBack,
  myList,
  onToggleFavorite,
}: {
  items: WatchHistory[];
  onOpen: (item: WatchHistory) => void;
  onRemove: (item: WatchHistory) => void;
  onBack: () => void;
  myList: Favorite[];
  onToggleFavorite: (item: WatchHistory) => void;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<ShelfSort>("recent");
  const normalized = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    const next = items.filter((item) =>
      `${item.title} ${item.provider} ${item.episodeTitle ?? ""}`.toLowerCase().includes(normalized),
    );
    next.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "provider") return a.provider.localeCompare(b.provider) || a.title.localeCompare(b.title);
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
    return next;
  }, [items, normalized, sort]);

  return (
    <ShelfPageShell
      title="Continue Watching"
      count={items.length}
      filter={filter}
      sort={sort}
      empty="Nothing to resume yet."
      onBack={onBack}
      onFilterChange={setFilter}
      onSortChange={setSort}
      className="history-page"
    >
      {filtered.map((item) => (
        <HistoryCard
          item={item}
          key={item.animeId}
          onOpen={onOpen}
          onRemove={onRemove}
          isFavorite={myList.some((fav) => fav.animeId === item.animeId)}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
      {!filtered.length && <EmptyPanel title={items.length ? "No matches" : "ani-desk"} compact />}
    </ShelfPageShell>
  );
}

function MyListPage({
  items,
  onOpen,
  onRemove,
  onBack,
}: {
  items: Anime[];
  onOpen: (anime: Anime) => void;
  onRemove: (anime: Anime) => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<ShelfSort>("recent");
  const normalized = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    const next = items.filter((item) =>
      `${item.title} ${item.provider} ${item.language}`.toLowerCase().includes(normalized),
    );
    next.sort((a, b) => {
      if (sort === "provider") return a.provider.localeCompare(b.provider) || a.title.localeCompare(b.title);
      if (sort === "title") return a.title.localeCompare(b.title);
      return 0;
    });
    return next;
  }, [items, normalized, sort]);

  return (
    <ShelfPageShell
      title="My List"
      count={items.length}
      filter={filter}
      sort={sort}
      empty="Your My List is empty."
      onBack={onBack}
      onFilterChange={setFilter}
      onSortChange={setSort}
    >
      {filtered.map((anime) => (
        <AnimeCard
          anime={anime}
          key={`${anime.provider}:${anime.id}`}
          onOpen={onOpen}
          onRemove={onRemove}
          isFavorite={true}
          onToggleFavorite={onRemove}
        />
      ))}
      {!filtered.length && <EmptyPanel title={items.length ? "No matches" : "ani-desk"} compact />}
    </ShelfPageShell>
  );
}

function ShelfPageShell({
  title,
  count,
  filter,
  sort,
  empty,
  onBack,
  onFilterChange,
  onSortChange,
  className,
  children,
}: {
  title: string;
  count: number;
  filter: string;
  sort: ShelfSort;
  empty: string;
  onBack: () => void;
  onFilterChange: (filter: string) => void;
  onSortChange: (sort: ShelfSort) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.section className={`grid-page ${className || ""}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <div className="page-title-row">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft size={21} />
        </IconButton>
        <div>
          <p className="eyebrow">{count} saved</p>
          <h1>{title}</h1>
        </div>
      </div>

      <div className="shelf-toolbar">
        <label>
          <Search size={18} />
          <input value={filter} placeholder="Filter titles..." onChange={(event) => onFilterChange(event.target.value)} />
        </label>
        <select value={sort} onChange={(event) => onSortChange(event.target.value as ShelfSort)} aria-label="Sort shelf">
          <option value="recent">Recent</option>
          <option value="title">Title</option>
          <option value="provider">Provider</option>
        </select>
      </div>

      {count ? <div className="poster-grid">{children}</div> : <p className="empty-state">{empty}</p>}
    </motion.section>
  );
}

function AnimeCard({
  anime,
  onOpen,
  onRemove,
  isFavorite,
  onToggleFavorite,
}: {
  anime: Anime;
  onOpen: (anime: Anime) => void;
  onRemove?: (anime: Anime) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (anime: Anime) => void;
}) {
  return (
    <motion.article whileHover={{ scale: 1.04, y: -8 }} className="poster-card">
      <button className="poster-click" onClick={() => onOpen(anime)}>
        <img src={anime.coverUrl || LOGO_SRC} alt="" loading="lazy" />
        <span>{anime.title}</span>
        <small>{anime.provider} / {anime.language}</small>
      </button>
      {onToggleFavorite && (
        <button
          className="card-favorite"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(anime);
          }}
          aria-label={isFavorite ? `Remove ${anime.title} from favorites` : `Add ${anime.title} to favorites`}
        >
          {isFavorite ? (
            <Star size={16} fill="var(--red)" style={{ color: "var(--red)" }} />
          ) : (
            <Star size={16} style={{ color: "var(--red)" }} />
          )}
        </button>
      )}
      {onRemove && (
        <button
          className="card-remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(anime);
          }}
          aria-label={`Remove ${anime.title}`}
        >
          <Trash2 size={16} />
        </button>
      )}
    </motion.article>
  );
}

function HistoryCard({
  item,
  onOpen,
  onRemove,
  isFavorite,
  onToggleFavorite,
}: {
  item: WatchHistory;
  onOpen: (item: WatchHistory) => void;
  onRemove?: (item: WatchHistory) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (item: WatchHistory) => void;
}) {
  const progress = item.totalSeconds > 0 ? Math.min(100, (item.positionSeconds / item.totalSeconds) * 100) : 0;
  return (
    <motion.article whileHover={{ scale: 1.035, y: -7 }} className="poster-card history">
      <button className="poster-click" onClick={() => onOpen(item)}>
        <div className="poster-image-wrapper">
          <img src={item.coverUrl || LOGO_SRC} alt="" loading="lazy" />
          <div className="play-overlay">
            <Film size={28} />
          </div>
          <div className="progress watch-progress"><i style={{ width: `${progress}%` }} /></div>
        </div>
        <span>{item.title}</span>
        <small>Episode {item.episodeNumber}{item.episodeTitle ? ` / ${item.episodeTitle}` : ""}</small>
      </button>
      {onToggleFavorite && (
        <button
          className="card-favorite"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(item);
          }}
          aria-label={isFavorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`}
        >
          {isFavorite ? (
            <Star size={16} fill="var(--red)" style={{ color: "var(--red)" }} />
          ) : (
            <Star size={16} style={{ color: "var(--red)" }} />
          )}
        </button>
      )}
      {onRemove && (
        <button
          className="card-remove"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(item);
          }}
          aria-label={`Remove ${item.title}`}
        >
          <Trash2 size={16} />
        </button>
      )}
    </motion.article>
  );
}

function chunkEpisodes(episodes: Episode[]) {
  const chunks: Episode[][] = [];
  for (let index = 0; index < episodes.length; index += EPISODE_RANGE_SIZE) {
    chunks.push(episodes.slice(index, index + EPISODE_RANGE_SIZE));
  }
  return chunks;
}

function DetailPage({
  anime,
  episodes,
  loading,
  isFavorite,
  resumeHistory,
  onBack,
  onToggleMyList,
  onPlay,
}: {
  anime: Anime;
  episodes: Episode[];
  loading: boolean;
  isFavorite: boolean;
  resumeHistory?: WatchHistory;
  onBack: () => void;
  onToggleMyList: () => void;
  onPlay: (episode: Episode, startTime?: number) => void;
}) {
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [latestFirst, setLatestFirst] = useState(false);
  const [rangeIndex, setRangeIndex] = useState(0);
  const [jumpEpisode, setJumpEpisode] = useState("");
  const [highlightEpisodeNumber, setHighlightEpisodeNumber] = useState<number | null>(null);
  const episodeListRef = useRef<HTMLDivElement | null>(null);

  const sortedEpisodes = useMemo(() => {
    return [...episodes].sort((a, b) => a.number - b.number);
  }, [episodes]);

  const baseRanges = useMemo(() => chunkEpisodes(sortedEpisodes), [sortedEpisodes]);
  const safeRangeIndex = Math.min(rangeIndex, Math.max(0, baseRanges.length - 1));
  const activeRangeEpisodes = baseRanges[safeRangeIndex] ?? [];
  const visibleEpisodes = useMemo(() => {
    const normalized = episodeQuery.trim().toLowerCase();
    const source = normalized
      ? activeRangeEpisodes.filter((episode) =>
          `${episode.number} ${episode.title ?? ""}`.toLowerCase().includes(normalized),
        )
      : activeRangeEpisodes;
    return latestFirst ? [...source].reverse() : source;
  }, [activeRangeEpisodes, episodeQuery, latestFirst]);

  useEffect(() => {
    if (!baseRanges.length) {
      setRangeIndex(0);
      setHighlightEpisodeNumber(null);
      return;
    }

    const resumeNumber = resumeHistory?.episodeNumber;
    const resumeRangeIndex = resumeNumber
      ? baseRanges.findIndex((range) => range.some((episode) => episode.number === resumeNumber))
      : -1;

    setEpisodeQuery("");
    setRangeIndex(resumeRangeIndex >= 0 ? resumeRangeIndex : 0);
    setHighlightEpisodeNumber(resumeNumber ?? null);
  }, [anime.provider, anime.id, baseRanges.length, resumeHistory?.episodeNumber]);

  useEffect(() => {
    setRangeIndex((current) => Math.min(current, Math.max(0, baseRanges.length - 1)));
  }, [baseRanges.length]);

  useEffect(() => {
    if (!highlightEpisodeNumber) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const node = episodeListRef.current?.querySelector<HTMLElement>(
        `[data-episode-number="${highlightEpisodeNumber}"]`,
      );
      node?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightEpisodeNumber, safeRangeIndex, latestFirst, episodeQuery]);

  const firstEpisode = sortedEpisodes[0];
  const latestEpisode = sortedEpisodes[sortedEpisodes.length - 1];
  const jumpTarget = sortedEpisodes.find((episode) => episode.number === Number(jumpEpisode));
  const resumeEpisode = resumeHistory
    ? episodes.find((episode) => episode.number === resumeHistory.episodeNumber)
    : undefined;
  const activeRangeLabel = activeRangeEpisodes.length
    ? `${activeRangeEpisodes[0].number}-${activeRangeEpisodes[activeRangeEpisodes.length - 1].number}`
    : "0";

  function focusEpisode(episode: Episode) {
    const nextRange = baseRanges.findIndex((range) =>
      range.some((candidate) => candidate.number === episode.number),
    );
    if (nextRange >= 0) {
      setEpisodeQuery("");
      setRangeIndex(nextRange);
      setHighlightEpisodeNumber(episode.number);
    }
  }

  function playJumpTarget() {
    if (!jumpTarget) return;
    focusEpisode(jumpTarget);
  }

  return (
    <motion.section
      className="detail-page"
      initial={{ opacity: 0, scale: 0.985, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.99, y: -14 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
    >
      <div className="detail-page-shell">
        <IconButton label="Back" className="detail-back-button" onClick={onBack}>
          <ArrowLeft size={21} />
        </IconButton>
        <div className="detail-hero" style={{ backgroundImage: `url(${anime.bannerUrl || anime.coverUrl || LOGO_SRC})` }}>
          <div>
            <p className="eyebrow">{anime.provider} / {anime.language}</p>
            <h2>{anime.title}</h2>
            <p>{anime.synopsis || "Episodes are loaded directly from the selected source."}</p>
            <div className="detail-actions">
              {resumeEpisode && (
                <button className="primary" onClick={() => onPlay(resumeEpisode, resumeHistory?.positionSeconds ?? 0)}>
                  <Play size={18} />
                  Resume E{resumeEpisode.number}
                </button>
              )}
              <button className={resumeEpisode ? "" : "primary"} disabled={!firstEpisode} onClick={() => firstEpisode && onPlay(firstEpisode)}>
                <Play size={18} />
                Episode 1
              </button>
              <button disabled={!latestEpisode} onClick={() => latestEpisode && onPlay(latestEpisode)}>
                <Clock size={18} />
                Latest
              </button>
              <button onClick={onToggleMyList}>
                {isFavorite ? (
                  <Star size={18} fill="var(--red)" style={{ color: "var(--red)" }} />
                ) : (
                  <Star size={18} style={{ color: "var(--red)" }} />
                )}
                {isFavorite ? "In My List" : "My List"}
              </button>
            </div>
          </div>
        </div>
        <div className="episode-panel">
          <div className="episode-heading">
            <div>
              <h3>Episodes</h3>
              <span>Range {activeRangeLabel} / {episodes.length} total</span>
            </div>
            <div className="episode-heading-actions">
              {resumeEpisode && (
                <button className="episode-resume-jump" onClick={() => focusEpisode(resumeEpisode)}>
                  <Clock size={15} />
                  E{resumeEpisode.number} at {formatTime(resumeHistory?.positionSeconds ?? 0)}
                </button>
              )}
              <strong>{visibleEpisodes.length} shown</strong>
            </div>
          </div>
          <div className="episode-toolbar">
            <label>
              <Search size={17} />
              <input
                value={episodeQuery}
                placeholder="Episode number or title"
                onChange={(event) => setEpisodeQuery(event.target.value)}
              />
            </label>
            <div className="episode-sort">
              <button className={!latestFirst ? "active" : ""} onClick={() => setLatestFirst(false)}>First</button>
              <button className={latestFirst ? "active" : ""} onClick={() => setLatestFirst(true)}>Latest</button>
            </div>
            <div className="episode-jump">
              <input
                value={jumpEpisode}
                inputMode="numeric"
                placeholder="Jump"
                onChange={(event) => setJumpEpisode(event.target.value.replace(/\D/g, ""))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") playJumpTarget();
                }}
              />
              <button disabled={!jumpTarget} onClick={playJumpTarget}>Go</button>
            </div>
          </div>
          <div className="episode-browser">
            <nav className="episode-range-rail" aria-label="Episode ranges">
              {baseRanges.map((range, index) => {
                const first = range[0]?.number;
                const last = range[range.length - 1]?.number;
                const rangeHasResume = resumeEpisode
                  ? range.some((episode) => episode.number === resumeEpisode.number)
                  : false;
                return (
                  <button
                    key={`${first}-${last}`}
                    className={`episode-range-button${safeRangeIndex === index ? " active" : ""}${rangeHasResume ? " resume-range" : ""}`}
                    onClick={() => {
                      setRangeIndex(index);
                      setHighlightEpisodeNumber(null);
                    }}
                  >
                    <span>{first}-{last}</span>
                    <small>{rangeHasResume ? "Resume" : range.length}</small>
                  </button>
                );
              })}
            </nav>
            <div className="episode-list-shell">
              {loading ? <p className="empty-state">Loading episodes...</p> : null}
              {!loading && !visibleEpisodes.length ? <p className="empty-state">No episodes match your filter.</p> : null}
              <AnimatePresence mode="popLayout">
                <motion.div
                  ref={episodeListRef}
                  className="episode-list"
                  key={`${safeRangeIndex}-${latestFirst}-${episodeQuery}`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                >
                  {visibleEpisodes.map((episode) => {
                    const isResume = resumeEpisode?.number === episode.number;
                    const highlighted = highlightEpisodeNumber === episode.number;
                    return (
                      <button
                        className={`episode-list-row${episode.thumbnail ? " has-thumbnail" : ""}${isResume ? " watched" : ""}${highlighted ? " highlighted" : ""}`}
                        key={episode.id}
                        data-episode-number={episode.number}
                        onClick={() => onPlay(episode, isResume ? resumeHistory?.positionSeconds ?? 0 : 0)}
                      >
                        <span className="episode-thumb">
                          {episode.thumbnail ? <img src={episode.thumbnail} alt="" loading="lazy" /> : <Play size={18} />}
                        </span>
                        <span className="episode-row-copy">
                          <strong>Episode {episode.number}</strong>
                          <small>{episode.title || `Episode ${episode.number}`}</small>
                        </span>
                        {isResume && <span className="episode-resume-pill">Resume</span>}
                        <Play className="episode-play-icon" size={18} fill="currentColor" />
                      </button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function VideoPlayer({ context, onClose }: { context: PlayerContext; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const qualityRef = useRef("auto");
  const savingAtRef = useRef(0);
  const controlsTimerRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState("auto");
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(context.startTime);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const streamIsHls = context.playback.streamKind === "hls" || context.playback.originalUrl.toLowerCase().includes(".m3u8");
  const subtitleTracks = context.playback.subtitles.filter((item) => item.url);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    let networkRetries = 0;

    setError(null);
    setLevels([]);
    setQuality("auto");
    setCurrentTime(context.startTime);
    setDuration(0);
    qualityRef.current = "auto";
    hlsRef.current?.destroy();
    hlsRef.current = null;
    video.removeAttribute("src");
    video.load();

    const startPlayback = () => {
      if (disposed) return;
      try {
        if (context.startTime > 0) video.currentTime = context.startTime;
      } catch {
        // Some WebViews reject currentTime before metadata is ready.
      }
      void video.play().catch(() => undefined);
    };

    const handleNativeError = () => {
      if (!disposed) setError("The browser player could not decode this stream. Try mpv fallback.");
    };

    video.addEventListener("error", handleNativeError);

    if (streamIsHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({ capLevelToPlayerSize: true, enableWorker: true });
        hlsRef.current = hls;
        hls.attachMedia(video);
        hls.loadSource(context.playback.playbackUrl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (disposed) return;
          setLevels(hls.levels.map((level, index) => ({ index, label: formatLevel(level, index) })));
          applyHlsQuality(hls, qualityRef.current);
          startPlayback();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || disposed) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 1) {
            networkRetries += 1;
            hls.startLoad();
          } else {
            const detail = data.details ? ` (${data.details})` : "";
            setError(`The browser player failed to load this HLS stream${detail}. Try mpv fallback.`);
            hls.destroy();
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = context.playback.playbackUrl;
        video.addEventListener("loadedmetadata", startPlayback, { once: true });
        video.load();
      } else {
        setError("This system WebView cannot play HLS streams. Use mpv fallback.");
      }
    } else {
      video.src = context.playback.playbackUrl;
      video.addEventListener("loadedmetadata", startPlayback, { once: true });
      video.load();
    }

    return () => {
      disposed = true;
      video.removeEventListener("error", handleNativeError);
      video.removeEventListener("loadedmetadata", startPlayback);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [context.playback.playbackUrl, context.playback.originalUrl, context.playback.streamKind, context.startTime, streamIsHls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncState = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setVolume(video.volume);
      setMuted(video.muted);
      setIsPlaying(!video.paused);
    };

    video.addEventListener("timeupdate", syncState);
    video.addEventListener("loadedmetadata", syncState);
    video.addEventListener("play", syncState);
    video.addEventListener("pause", syncState);
    video.addEventListener("volumechange", syncState);
    return () => {
      video.removeEventListener("timeupdate", syncState);
      video.removeEventListener("loadedmetadata", syncState);
      video.removeEventListener("play", syncState);
      video.removeEventListener("pause", syncState);
      video.removeEventListener("volumechange", syncState);
    };
  }, []);

  useEffect(() => {
    const saveInterval = window.setInterval(() => {
      void saveProgress();
    }, 15000);

    return () => window.clearInterval(saveInterval);
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "SELECT") return;

      if (event.key === " ") {
        event.preventDefault();
        togglePlay();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekBy(-10);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seekBy(10);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setVideoVolume(Math.min(1, volume + 0.1));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setVideoVolume(Math.max(0, volume - 0.1));
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        toggleMute();
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void toggleFullscreen();
      } else if (event.key === "Escape") {
        event.preventDefault();
        void closePlayer();
      }
      revealControls();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [volume, muted, isPlaying]);

  useEffect(() => {
    revealControls();
  }, [isPlaying]);

  function revealControls() {
    setShowControls(true);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    if (videoRef.current && !videoRef.current.paused) {
      controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 2600);
    }
  }

  function changeQuality(nextQuality: string) {
    qualityRef.current = nextQuality;
    setQuality(nextQuality);
    applyHlsQuality(hlsRef.current, nextQuality);
  }

  async function saveProgress(force = false) {
    const video = videoRef.current;
    if (!video) return;
    const now = Date.now();
    if (!force && now - savingAtRef.current < 5000) return;
    savingAtRef.current = now;
    await api.saveProgress({
      animeId: animeKey(context.anime.provider, context.anime.id),
      provider: context.anime.provider,
      title: context.anime.title,
      coverUrl: context.anime.coverUrl,
      episodeNumber: context.episode.number,
      episodeTitle: context.episode.title,
      positionSeconds: Math.floor(video.currentTime || 0),
      totalSeconds: Math.floor(Number.isFinite(video.duration) ? video.duration : 0),
    });
  }

  async function openMpv() {
    const current = Math.floor(videoRef.current?.currentTime || context.startTime || 0);
    await api.openInMpv(context.anime.provider, context.episode.id, current);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
      void saveProgress(true);
    }
  }

  function seekBy(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const max = Number.isFinite(video.duration) ? video.duration : video.currentTime + seconds;
    video.currentTime = Math.max(0, Math.min(max, video.currentTime + seconds));
    setCurrentTime(video.currentTime);
    void saveProgress(true);
  }

  function setVideoVolume(nextVolume: number) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = nextVolume;
    if (nextVolume > 0) video.muted = false;
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }

  async function toggleFullscreen() {
    const root = videoRef.current?.parentElement;
    if (!root) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    } else {
      await root.requestFullscreen().catch(() => undefined);
    }
  }

  async function closePlayer() {
    await saveProgress(true);
    onClose();
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <motion.div
      className={showControls ? "player-overlay controls-visible" : "player-overlay"}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseMove={revealControls}
      onClick={revealControls}
    >
      <video
        ref={videoRef}
        autoPlay
        onTimeUpdate={() => void saveProgress()}
        onPause={() => void saveProgress(true)}
        onEnded={() => void saveProgress(true)}
      >
        {subtitleTracks.map((item, index) => (
          <track
            key={item.url}
            kind="subtitles"
            src={item.url}
            srcLang={languageCode(item.language)}
            label={item.language}
            default={index === 0}
          />
        ))}
      </video>

      <div className="player-top">
        <button onClick={() => void closePlayer()}>
          <ArrowLeft size={20} />
          Back
        </button>
        <div>
          <strong>{context.anime.title}</strong>
          <span>Episode {context.episode.number}</span>
        </div>
      </div>

      <div className="player-center">
        <button onClick={() => seekBy(-10)} aria-label="Back 10 seconds">
          <SkipBack size={30} />
        </button>
        <button className="play-ring" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Pause size={34} /> : <Play size={34} />}
        </button>
        <button onClick={() => seekBy(10)} aria-label="Forward 10 seconds">
          <SkipForward size={30} />
        </button>
      </div>

      <div className="player-bottom">
        {error && <span className="player-error">{error}</span>}
        <input
          className="player-progress"
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={Math.min(currentTime, duration || currentTime)}
          style={{ "--progress": `${progress}%` } as React.CSSProperties}
          onChange={(event) => {
            const video = videoRef.current;
            if (!video) return;
            video.currentTime = Number(event.target.value);
            setCurrentTime(video.currentTime);
          }}
          onMouseUp={() => void saveProgress(true)}
        />
        <div className="player-control-row">
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            {muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          <input
            className="volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => setVideoVolume(Number(event.target.value))}
            aria-label="Volume"
          />
          <label>
            Quality
            <select value={quality} onChange={(event) => changeQuality(event.target.value)} disabled={!streamIsHls || !levels.length}>
              <option value="auto">Auto</option>
              {levels.map((level) => <option value={String(level.index)} key={level.index}>{level.label}</option>)}
            </select>
          </label>
          {subtitleTracks.length > 0 && <span className="player-note">{subtitleTracks.length} subtitle track{subtitleTracks.length === 1 ? "" : "s"}</span>}
          {context.playback.canFallbackToMpv && (
            <button onClick={() => void openMpv()}>
              <MonitorPlay size={18} />
              mpv
            </button>
          )}
          <button onClick={() => void toggleFullscreen()} aria-label="Fullscreen">
            <Maximize size={18} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyPanel({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <div className={compact ? "empty-panel compact" : "empty-panel"}>
      <h2>{title}</h2>
    </div>
  );
}

function IconButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={className ? `icon-button ${className}` : "icon-button"} onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function historyToAnime(item: WatchHistory, myList: Favorite[]): Anime {
  return {
    id: item.animeId.includes(":") ? item.animeId.split(":").slice(1).join(":") : item.animeId,
    provider: item.provider,
    title: item.title,
    coverUrl: item.coverUrl,
    bannerUrl: null,
    language: "History",
    totalEpisodes: null,
    synopsis: null,
    isFavorite: myList.some((favorite) => favorite.animeId === item.animeId),
  };
}

function detailPatch(details: AnimeDetails): Partial<Anime> {
  const patch: Partial<Anime> = {};
  if (nonEmpty(details.coverUrl)) patch.coverUrl = details.coverUrl!.trim();
  if (nonEmpty(details.bannerUrl)) patch.bannerUrl = details.bannerUrl!.trim();
  if (typeof details.totalEpisodes === "number" && details.totalEpisodes > 0) {
    patch.totalEpisodes = details.totalEpisodes;
  }
  if (nonEmpty(details.synopsis)) patch.synopsis = details.synopsis!.trim();
  return patch;
}

function mergeAnimeDetails(anime: Anime, patch: Partial<Anime>): Anime {
  return {
    ...anime,
    coverUrl: nonEmpty(patch.coverUrl) ? patch.coverUrl! : anime.coverUrl,
    bannerUrl: nonEmpty(patch.bannerUrl) ? patch.bannerUrl : anime.bannerUrl,
    totalEpisodes: patch.totalEpisodes ?? anime.totalEpisodes,
    synopsis: nonEmpty(patch.synopsis) ? patch.synopsis : anime.synopsis,
  };
}

function nonEmpty(value?: string | null) {
  return typeof value === "string" && value.trim().length > 0;
}

function findHistoryForAnime(anime: Anime, history: WatchHistory[]) {
  const key = animeKey(anime.provider, anime.id);
  return history.find((item) => item.animeId === key);
}

function loadSavedSourceName() {
  try {
    return localStorage.getItem(SOURCE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveSourceName(sourceName: string) {
  try {
    localStorage.setItem(SOURCE_STORAGE_KEY, sourceName);
  } catch {
    // localStorage can be unavailable in restricted WebView contexts.
  }
}

function applyHlsQuality(hls: Hls | null, quality: string) {
  if (!hls) return;
  if (quality === "auto") {
    hls.currentLevel = -1;
    return;
  }
  const level = Number(quality);
  if (Number.isInteger(level)) hls.currentLevel = level;
}

function formatLevel(level: { height?: number; bitrate?: number; name?: string }, index: number) {
  if (level.height) return `${level.height}p`;
  if (level.name) return level.name;
  if (level.bitrate) return `${Math.round(level.bitrate / 1000)} kbps`;
  return `Level ${index + 1}`;
}

function languageCode(language: string) {
  const normalized = language.toLowerCase();
  if (normalized.startsWith("vi")) return "vi";
  if (normalized.startsWith("en")) return "en";
  return normalized.slice(0, 2) || "und";
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default App;
