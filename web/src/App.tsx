import Hls from "hls.js";
import type { MediaPlayerClass, Representation } from "dashjs";
import {
  ArrowLeft,
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Film,
  FolderOpen,
  HardDrive,
  Loader2,
  LogOut,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  Search,
  ShieldCheck,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { animeKey, api, favoriteToAnime } from "./api";
import { episodeLabel, episodeTitleDetail } from "./episode-label";
import type {
  Anime,
  AnimeDetails,
  AppError,
  CatalogAnime,
  CatalogFilters,
  DiscoveryCatalog,
  DownloadRecord,
  Episode,
  EpisodeDownloadState,
  Favorite,
  ManagedUser,
  PlayerContext,
  ProviderAvailability,
  Source,
  SessionUser,
  WatchHistory,
} from "./types";
import {
  type AppUpdateState,
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  relaunchApp,
} from "./updater";

const SOURCE_STORAGE_KEY = "ani-desk:selected-source";
const EPISODE_RANGE_SIZE = 50;
const LOGO_SRC = "/logo.png";
const fadeUpVariant = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

type Route = "home" | "my-list" | "continue" | "downloads" | "admin" | "search" | "detail" | "catalog";
type QualityLevel = { index: number; label: string; id?: string };
type ShelfSort = "recent" | "title" | "provider";

function App() {
  const [session, setSession] = useState<SessionUser | null | undefined>(undefined);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Anime[]>([]);
  const [catalogResults, setCatalogResults] = useState<CatalogAnime[]>([]);
  const [providerResults, setProviderResults] = useState<Anime[]>([]);
  const [catalogSelection, setCatalogSelection] = useState<CatalogAnime | null>(null);
  const [availability, setAvailability] = useState<ProviderAvailability[]>([]);
  const [catalogSearchError, setCatalogSearchError] = useState<AppError | null>(null);
  const [languageGroup, setLanguageGroup] = useState<"english" | "vietnamese">("english");
  const [discovery, setDiscovery] = useState<DiscoveryCatalog | null>(null);
  const [searchSelection, setSearchSelection] = useState<Anime | null>(null);
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [continueWatching, setContinueWatching] = useState<WatchHistory[]>([]);
  const [myList, setMyList] = useState<Favorite[]>([]);
  const [player, setPlayer] = useState<PlayerContext | null>(null);
  const [episodeDownloads, setEpisodeDownloads] = useState<Record<string, EpisodeDownloadState>>({});
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [route, setRoute] = useState<Route>("home");
  const [routeStack, setRouteStack] = useState<Route[]>([]);
  const detailCacheRef = useRef<Record<string, Partial<Anime>>>({});
  const availabilityCacheRef = useRef(new Map<string, { expiresAt: number; items: ProviderAvailability[] }>());
  const catalogSearchCacheRef = useRef(new Map<string, { expiresAt: number; items: CatalogAnime[] }>());
  const catalogCooldownUntilRef = useRef(0);
  const availabilityGenerationRef = useRef(0);
  const catalogSearchGenerationRef = useRef(0);
  const pendingUpdateRef = useRef<Update | null>(null);
  const [appUpdate, setAppUpdate] = useState<AppUpdateState>({ status: "idle" });
  const [providerAccessPending, setProviderAccessPending] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (bootstrapping || !isTauriRuntime()) return;
    const handle = window.setTimeout(() => {
      void checkAppUpdates();
    }, 900);
    return () => window.clearTimeout(handle);
  }, [bootstrapping]);

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
    setAvailability([]);
    setSearchSelection(null);
    if (cleanQuery.length < 2) {
      setCatalogResults([]);
      setProviderResults([]);
      setCatalogSelection(null);
      setCatalogSearchError(null);
      return;
    }

    const handle = window.setTimeout(() => void searchCatalog(cleanQuery), 320);

    return () => window.clearTimeout(handle);
  }, [query, route, languageGroup, selectedSource?.name]);

  useEffect(() => {
    if (!sources.length) return;
    const current = selectedSource;
    if (current?.languageGroup === languageGroup) return;
    const nextSource = firstSearchableSource(sources, languageGroup);
    if (nextSource) selectSource(nextSource);
  }, [sources, languageGroup, selectedSource?.name]);

  useEffect(() => {
    if (route !== "search" || !catalogSelection) return;
    void loadAvailability(catalogSelection, languageGroup);
  }, [route, catalogSelection?.catalogId, languageGroup]);

  async function bootstrap() {
    try {
      const currentSession = await api.getSession();
      setSession(currentSession);
      if (!currentSession) return;
      const [sourceList, history, favorites, downloadLibrary] = await Promise.all([
        api.listSources(),
        api.getContinueWatching(200),
        api.getMyList(300),
        api.listDownloads(500),
      ]);
      const savedSourceName = loadSavedSourceName();
      const nextSource = sourceList.find((source) => source.name === savedSourceName) ?? sourceList[0] ?? null;

      setSources(sourceList);
      setSelectedSource(nextSource);
      if (nextSource) saveSourceName(nextSource.name);
      setContinueWatching(history);
      setMyList(favorites);
      setDownloads(downloadLibrary);
      void api.listProviderHealth().then((health) => {
        setSources(health);
        setSelectedSource((current) => health.find((source) => source.name === current?.name) ?? health[0] ?? null);
      }).catch((err) => setError(toAppError(err, "provider-health")));
      void api.getDiscovery().then((catalog) => {
        setDiscovery(catalog);
      }).catch((err) => setError(toAppError(err, "catalog")));
    } catch (err) {
      const appError = toAppError(err, "bootstrap");
      setError(appError);
      setAuthError(appError.message);
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

  async function refreshDownloads() {
    setDownloads(await api.listDownloads(500));
  }

  async function signIn(username: string, password: string) {
    setAuthError(null);
    setBootstrapping(true);
    try {
      await api.login(username, password);
      await bootstrap();
    } catch (err) {
      setAuthError(toAppError(err, "login").message);
      setBootstrapping(false);
    }
  }

  async function signOut() {
    try {
      await api.logout();
    } finally {
      setSession(null);
      setRoute("home");
      setRouteStack([]);
      setSources([]);
      setContinueWatching([]);
      setMyList([]);
      setDownloads([]);
    }
  }

  async function checkAppUpdates() {
    setAppUpdate({ status: "checking" });
    try {
      const update = await checkForAppUpdate();
      pendingUpdateRef.current = update;

      if (!update) {
        setAppUpdate({ status: "idle" });
        return;
      }

      setAppUpdate({
        status: "available",
        version: update.version,
        currentVersion: update.currentVersion,
        notes: update.body,
      });
    } catch (err) {
      setAppUpdate({
        status: "error",
        message: `Update check failed: ${errorMessage(err)}`,
      });
    }
  }

  async function installUpdate() {
    const update = pendingUpdateRef.current;
    if (!update) return;

    setAppUpdate((current) => ({ ...current, status: "downloading", progress: 0, message: undefined }));
    try {
      await downloadAndInstallAppUpdate(update, (progress) => {
        setAppUpdate((current) => ({
          ...current,
          status: "downloading",
          progress: progress.percent,
          message: progress.total
            ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}`
            : `${formatBytes(progress.downloaded)} downloaded`,
        }));
      });

      setAppUpdate((current) => ({ ...current, status: "ready", progress: 100, message: "Update installed. Relaunching ani-desk..." }));
      await relaunchApp();
    } catch (err) {
      setAppUpdate((current) => ({
        ...current,
        status: "error",
        message: `Update failed: ${errorMessage(err)}`,
      }));
    }
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
  }

  function openSearch() {
    if (route !== "search") navigate("search");
  }

  async function searchCatalog(nextQuery = query, sourceOverride?: Source | null) {
    const cleanQuery = nextQuery.trim();
    const generation = ++catalogSearchGenerationRef.current;
    const activeSource = sourceOverride ?? selectedSource;
    if (cleanQuery.length < 2) {
      setCatalogResults([]);
      setProviderResults([]);
      setCatalogSelection(null);
      setSearchSelection(null);
      setCatalogSearchError(null);
      return;
    }

    setLoading(true);
    setError(null);
    setCatalogSearchError(null);
    setAvailability([]);
    setSearchSelection(null);
    try {
      const [catalogOutcome, providerOutcome] = await Promise.all([
        loadCatalogSearchResults(cleanQuery),
        activeSource
          ? searchProviderResults(cleanQuery, activeSource)
              .then((items) => ({ ok: true as const, items }))
              .catch((err) => ({ ok: false as const, error: toAppError(err, "provider-search") }))
          : Promise.resolve({ ok: true as const, items: [] }),
      ]);
      if (generation !== catalogSearchGenerationRef.current) return;
      const directItems = providerOutcome.ok ? providerOutcome.items : [];
      setProviderResults(directItems);
      if (!providerOutcome.ok) {
        setError(providerOutcome.error);
        if (activeSource && providerOutcome.error.code === "PROVIDER_CAPTCHA") {
          const blocked = { ...activeSource, status: "unavailable", failureCode: providerOutcome.error.code };
          setSources((current) => current.map((source) => source.name === blocked.name ? blocked : source));
          setSelectedSource(blocked);
        }
      }
      if (catalogOutcome.ok) {
        const items = catalogOutcome.items;
        setCatalogResults(items);
        if (directItems.length) {
          setCatalogSelection(null);
          setSearchSelection(directItems[0]);
        } else {
          setCatalogSelection(null);
        }
      } else {
        setCatalogResults([]);
        setCatalogSelection(null);
        setCatalogSearchError(catalogOutcome.error);
        if (directItems.length) {
          setSearchSelection(directItems[0]);
        } else {
          setSearchSelection(null);
          setError(catalogOutcome.error);
        }
      }
    } finally {
      if (generation === catalogSearchGenerationRef.current) setLoading(false);
    }
  }

  async function loadCatalogSearchResults(queryText: string): Promise<
    { ok: true; items: CatalogAnime[] } | { ok: false; error: AppError }
  > {
    const cacheKey = queryText.toLowerCase();
    const cached = catalogSearchCacheRef.current.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ok: true, items: cached.items };
    }
    if (catalogCooldownUntilRef.current > Date.now()) {
      return {
        ok: false,
        error: {
          code: "CATALOG_UNAVAILABLE",
          message: "AniList is rate limited. Showing provider results when available.",
          operation: "catalog-search",
          retryable: true,
          correlationId: crypto.randomUUID(),
          technical: "AniList search is cooling down after a 429 response.",
        },
      };
    }
    try {
      const items = await api.searchCatalog(queryText);
      catalogSearchCacheRef.current.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, items });
      return { ok: true, items };
    } catch (err) {
      const appError = toAppError(err, "catalog-search");
      if (appError.code === "CATALOG_UNAVAILABLE" && `${appError.technical ?? appError.message}`.includes("429")) {
        catalogCooldownUntilRef.current = Date.now() + 90_000;
      }
      return { ok: false, error: appError };
    }
  }

  async function searchProviderResults(queryText: string, source: Source) {
    if (source.status === "unavailable" || !source.capabilities.search) return [];
    const items = await api.searchSource(source.name, queryText);

    const seen = new Set<string>();
    return items
      .map((item) => ({
        ...item,
        language: item.language || source.language,
        isFavorite: myList.some((favorite) => favorite.animeId === animeKey(item.provider, item.id)),
      }))
      .filter((item) => {
        const key = animeKey(item.provider, item.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 36);
  }

  async function openProviderAccess(source: Source) {
    setProviderAccessPending(`open:${source.name}`);
    try {
      await api.openProviderAccess(source.name);
    } catch (err) {
      setError(toAppError(err, "provider-access"));
    } finally {
      setProviderAccessPending(null);
    }
  }

  async function completeProviderVerification(source: Source) {
    setProviderAccessPending(`retry:${source.name}`);
    try {
      const health = await api.completeProviderVerification(source.name);
      const verified = health.find((item) => item.name === source.name);
      setSources((current) => current.map((item) => health.find((update) => update.name === item.name) ?? item));
      if (verified) setSelectedSource(verified);
      if (verified?.status === "healthy" && query.trim().length >= 2) {
        await searchCatalog(query, verified);
      }
    } catch (err) {
      setError(toAppError(err, "provider-verification"));
    } finally {
      setProviderAccessPending(null);
    }
  }

  function selectProviderResult(anime: Anime) {
    setCatalogSelection(null);
    setAvailability([]);
    setSelectedSource(sources.find((source) => source.name === anime.provider) ?? null);
    setSearchSelection(anime);
  }

  function selectProviderSource(source: Source) {
    selectSource(source);
    const direct = providerResults.find((anime) => anime.provider === source.name);
    if (direct) {
      selectProviderResult(direct);
      return;
    }
    const option = availability.find((item) => item.provider === source.name);
    if (option?.anime) {
      void selectCatalogProvider(option);
      return;
    }
    setCatalogSelection(null);
    setSearchSelection(null);
    setProviderResults([]);
    if (query.trim().length >= 2) void searchCatalog(query, source);
  }

  function selectSearchLanguage(group: "english" | "vietnamese") {
    setLanguageGroup(group);
    const nextSource = firstSearchableSource(sources, group);
    if (nextSource) {
      selectSource(nextSource);
      if (query.trim().length >= 2) void searchCatalog(query, nextSource);
    }
  }

  function selectCatalogResult(anime: CatalogAnime) {
    setCatalogSelection((current) => {
      if (current?.catalogId === anime.catalogId) {
        return current;
      }
      return anime;
    });
    setSearchSelection(null);
  }

  async function loadAvailability(catalog: CatalogAnime, group: "english" | "vietnamese") {
    const generation = ++availabilityGenerationRef.current;
    const cacheKey = `${catalog.catalogId}:${group}`;
    setAvailability([]);
    setSearchSelection(null);
    setSelectedSource(null);
    setLoading(true);
    setError(null);
    try {
      const cached = availabilityCacheRef.current.get(cacheKey);
      const options = cached && cached.expiresAt > Date.now()
        ? cached.items
        : await api.resolveAvailability(catalog.catalogId, catalog.title, group);
      if (generation !== availabilityGenerationRef.current) return;
      availabilityCacheRef.current.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, items: options });
      setAvailability(options);
      const playable = options.find((item) => item.status === "available" && item.anime)?.anime ?? null;
      setSearchSelection(playable ? catalogToAnime(catalog, playable) : null);
      setSelectedSource(playable ? sources.find((source) => source.name === playable.provider) ?? null : null);
    } catch (err) {
      if (generation !== availabilityGenerationRef.current) return;
      setAvailability([]);
      setSearchSelection(null);
      setError(toAppError(err, "availability"));
    } finally {
      if (generation === availabilityGenerationRef.current) setLoading(false);
    }
  }

  async function selectCatalogProvider(option: ProviderAvailability) {
    if (!catalogSelection || !option.anime) return;
    setSelectedSource(sources.find((source) => source.name === option.provider) ?? null);
    setSearchSelection(catalogToAnime(catalogSelection, option.anime));
  }

  function openCatalogSearch(catalog: CatalogAnime) {
    setQuery(catalog.title);
    setCatalogSelection(catalog);
    setCatalogResults([catalog]);
    setAvailability([]);
    setSearchSelection(null);
    if (route !== "search") navigate("search");
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
    setProviderResults((items) =>
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
      setError(toAppError(err, "episodes"));
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
      setError(toAppError(err, "favorites"));
    }
  }

  async function removeFromMyList(anime: Anime) {
    const key = animeKey(anime.provider, anime.id);
    try {
      await api.removeFromMyList(key);
      setMyList((items) => items.filter((item) => item.animeId !== key));
      markFavorite(key, false);
    } catch (err) {
      setError(toAppError(err, "favorites"));
    }
  }

  async function removeHistoryItem(item: WatchHistory) {
    try {
      await api.removeContinueWatching(item.animeId);
      setContinueWatching((items) => items.filter((current) => current.animeId !== item.animeId));
    } catch (err) {
      setError(toAppError(err, "history"));
    }
  }

  function markFavorite(key: string, isFavorite: boolean) {
    setResults((items) =>
      items.map((item) =>
        animeKey(item.provider, item.id) === key ? { ...item, isFavorite } : item,
      ),
    );
    setProviderResults((items) =>
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
      setError(toAppError(err, "playback"));
    }
  }

  async function downloadEpisode(anime: Anime, episode: Episode) {
    const key = episodeDownloadKey(anime, episode);
    const current = episodeDownloads[key];
    if (current?.status === "preparing" || current?.status === "downloading") return;
    const downloadId = crypto.randomUUID();
    const metadata = {
      downloadId,
      provider: anime.provider,
      animeId: anime.id,
      animeTitle: anime.title,
      coverUrl: anime.coverUrl,
      episodeId: episode.id,
      episodeNumber: episode.number,
      episodeTitle: episode.title,
    };

    setEpisodeDownloads((items) => ({
      ...items,
      [key]: { ...metadata, status: "preparing", progress: 0, message: "Preparing download..." },
    }));

    try {
      const result = await api.downloadEpisode(
        {
          id: downloadId,
          provider: anime.provider,
          animeId: anime.id,
          episodeId: episode.id,
          animeTitle: anime.title,
          coverUrl: anime.coverUrl,
          episodeNumber: episode.number,
          episodeTitle: episode.title,
        },
        (event) => {
          const segmentProgress = event.completedSegments && event.totalSegments
            ? `${event.completedSegments} / ${event.totalSegments} segments`
            : event.totalBytes
              ? `${formatBytes(event.downloadedBytes)} / ${formatBytes(event.totalBytes)}`
              : `${formatBytes(event.downloadedBytes)} downloaded`;
          setEpisodeDownloads((items) => ({
            ...items,
            [key]: {
              ...metadata,
              status: event.event === "started" ? "preparing" : "downloading",
              progress: Math.max(0, Math.min(100, event.progress || 0)),
              message: event.event === "started" ? `Saving ${event.fileName || `Episode ${episode.number}`}...` : segmentProgress,
              fileName: event.fileName ?? items[key]?.fileName,
            },
          }));
        },
      );
      setEpisodeDownloads((items) => ({
        ...items,
        [key]: {
          ...metadata,
          downloadId: result.id,
          status: "complete",
          progress: 100,
          message: `Saved to ${result.filePath}`,
          filePath: result.filePath,
          fileName: result.fileName,
        },
      }));
      await refreshDownloads();
    } catch (err) {
      const appError = toAppError(err, "download");
      setEpisodeDownloads((items) => ({
        ...items,
        [key]: { ...metadata, status: "error", progress: 0, message: appError.message },
      }));
      setError(appError);
    }
  }

  async function openDownloadedFile(id: string) {
    try {
      await api.openDownload(id);
    } catch (err) {
      setError(toAppError(err, "downloads"));
      await refreshDownloads().catch(() => undefined);
    }
  }

  async function revealDownloadedFile(id: string) {
    try {
      await api.revealDownload(id);
    } catch (err) {
      setError(toAppError(err, "downloads"));
      await refreshDownloads().catch(() => undefined);
    }
  }

  async function deleteDownloadedFile(id: string) {
    try {
      await api.deleteDownload(id);
      setDownloads((items) => items.filter((item) => item.id !== id));
      setEpisodeDownloads((items) =>
        Object.fromEntries(Object.entries(items).filter(([, item]) => item.downloadId !== id)),
      );
    } catch (err) {
      setError(toAppError(err, "downloads"));
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

  if (!session) {
    return <LoginScreen error={authError ?? error?.message ?? null} onLogin={signIn} />;
  }

  return (
    <div className={`app-shell route-${route}`}>
      <div
        className="ambient-backdrop"
        style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
      />

      <main>
        {error && (
          <ErrorNotice
            error={error}
            onDismiss={() => setError(null)}
            onRetry={error.retryable ? () => void bootstrap() : undefined}
          />
        )}

        <LayoutGroup id="ani-desk-navigation">
        <AnimatePresence mode="wait" initial={false}>
          {route === "home" && (
            <motion.div key="home" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <HomeDashboard
                query={query}
                loading={loading}
                onOpenSearch={openSearch}
                continueItems={continueWatching.slice(0, 8)}
                continueTotal={continueWatching.length}
                discovery={discovery}
                savedAnime={savedAnime.slice(0, 10)}
                onOpenCatalog={openCatalogSearch}
                onOpenAnime={(anime) => void openAnime(anime)}
                onShowCatalog={() => navigate("catalog")}
                onResumeHistory={(item) => void openHistoryItem(item)}
                onShowHistory={continueWatching.length ? () => navigate("continue") : undefined}
                onShowMyList={() => navigate("my-list")}
                onShowDownloads={() => navigate("downloads")}
                downloadCount={downloads.length}
                session={session}
                onShowAdmin={session.hosted && session.role === "admin" ? () => navigate("admin") : undefined}
                onSignOut={session.hosted ? () => void signOut() : undefined}
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

          {route === "downloads" && (
            <DownloadsPage
              key="downloads"
              downloads={downloads}
              activeDownloads={episodeDownloads}
              onBack={goBack}
              onOpen={(id) => void openDownloadedFile(id)}
              onReveal={(id) => void revealDownloadedFile(id)}
              onDelete={(id) => void deleteDownloadedFile(id)}
              onRefresh={() => void refreshDownloads()}
            />
          )}

          {route === "admin" && session.hosted && session.role === "admin" && (
            <AdminPage key="admin" currentUser={session} onBack={goBack} />
          )}

          {route === "catalog" && (
            <CatalogPage
              key="catalog"
              genres={discovery?.genres ?? []}
              onBack={goBack}
              onOpen={openCatalogSearch}
            />
          )}

          {route === "search" && (
            <SearchStage
              key="search"
              query={query}
              results={catalogResults}
              providerResults={providerResults}
              catalogError={catalogSearchError}
              loading={loading}
              sources={sources}
              languageGroup={languageGroup}
              availability={availability}
              selectedSource={selectedSource}
              selectedCatalog={catalogSelection}
              selectedAnime={searchSelection}
              onQueryChange={setQuery}
              onSearch={() => void searchCatalog()}
              onLanguageChange={selectSearchLanguage}
              onProviderSelect={(option) => void selectCatalogProvider(option)}
              onProviderSourceSelect={selectProviderSource}
              onOpenProviderAccess={(source) => void openProviderAccess(source)}
              onCompleteProviderVerification={(source) => void completeProviderVerification(source)}
              providerAccessPending={providerAccessPending}
              onSelectProviderResult={selectProviderResult}
              onSelectCatalog={selectCatalogResult}
              onOpenAnime={(anime) => void openAnime(anime)}
              onDownload={(anime) => void openAnime(anime)}
              onToggleMyList={(anime) => void toggleMyList(anime)}
              onBack={goBack}
              myList={myList}
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
              onDownload={(episode) => void downloadEpisode(selectedAnime, episode)}
              downloadStates={episodeDownloads}
            />
          )}
        </AnimatePresence>
        </LayoutGroup>
      </main>

      <AnimatePresence>
        {appUpdate.status !== "idle" && appUpdate.status !== "checking" && (
          <UpdatePrompt
            key="update-prompt"
            state={appUpdate}
            onInstall={() => void installUpdate()}
            onDismiss={() => setAppUpdate({ status: "idle" })}
          />
        )}
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

function LoginScreen({
  error,
  onLogin,
}: {
  error: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <main className="login-screen">
      <div className="login-ambient" />
      <motion.section
        className="login-card"
        initial={{ opacity: 0, scale: 0.965, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
      >
        <div className="login-brand">
          <img src={LOGO_SRC} alt="ani-desk" />
          <div><span>ani-desk</span><small>Your anime, beautifully organized.</small></div>
        </div>
        <div className="login-copy">
          <p className="eyebrow">Private watch space</p>
          <h1>Welcome back.</h1>
          <p>Sign in to sync My List and continue watching across your desktop and mobile browser.</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!username.trim() || !password || submitting) return;
            setSubmitting(true);
            void onLogin(username.trim(), password).finally(() => setSubmitting(false));
          }}
        >
          <label>
            <span>Username</span>
            <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} autoFocus />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="login-error"><AlertTriangle size={16} /> {error}</p>}
          <button className="primary" disabled={submitting || !username.trim() || !password}>
            {submitting ? <Loader2 className="spin" size={18} /> : <ChevronRight size={18} />}
            {submitting ? "Signing in…" : "Continue"}
          </button>
        </form>
        <small className="login-footnote">Accounts are created by your ani-desk administrator.</small>
      </motion.section>
    </main>
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

function ErrorNotice({
  error,
  onDismiss,
  onRetry,
}: {
  error: AppError;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <motion.aside
      className="error-notice"
      initial={{ opacity: 0, y: -12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      role="alert"
    >
      <AlertTriangle size={19} />
      <div className="error-notice-copy">
        <strong>{error.code}</strong>
        <span>{error.message}</span>
        {expanded && (
          <dl>
            <div><dt>Operation</dt><dd>{error.operation}</dd></div>
            {error.provider && <div><dt>Provider</dt><dd>{error.provider}</dd></div>}
            <div><dt>Correlation</dt><dd>{error.correlationId}</dd></div>
            {error.technical && <div><dt>Details</dt><dd>{error.technical}</dd></div>}
          </dl>
        )}
      </div>
      <div className="error-notice-actions">
        <button onClick={() => setExpanded((value) => !value)}>{expanded ? "Less" : "Details"}</button>
        <IconButton label="Copy error details" onClick={() => void navigator.clipboard?.writeText(JSON.stringify(error, null, 2))}>
          <Copy size={17} />
        </IconButton>
        {onRetry && <button className="primary" onClick={onRetry}>Retry</button>}
        <IconButton label="Dismiss error" onClick={onDismiss}><X size={17} /></IconButton>
      </div>
    </motion.aside>
  );
}

function UpdatePrompt({
  state,
  onInstall,
  onDismiss,
}: {
  state: AppUpdateState;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const installing = state.status === "downloading" || state.status === "ready";
  const isError = state.status === "error";

  return (
    <motion.aside
      className={`update-prompt update-prompt-${state.status}`}
      initial={{ opacity: 0, y: -18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      role="status"
      aria-live="polite"
    >
      <div className="update-prompt-icon">
        {state.status === "downloading" ? <Loader2 className="spin" size={20} /> : <Check size={20} />}
      </div>
      <div className="update-prompt-copy">
        <strong>{isError ? "Update could not finish" : state.status === "ready" ? "Update installed" : `ani-desk ${state.version} is available`}</strong>
        <span>
          {state.message ||
            (state.notes
              ? state.notes
              : state.currentVersion
                ? `You are running ${state.currentVersion}.`
                : "A signed update is ready to install.")}
        </span>
        {state.status === "downloading" && (
          <div className="update-progress" aria-label="Update download progress">
            <i style={{ width: `${state.progress ?? 8}%` }} />
          </div>
        )}
      </div>
      <div className="update-prompt-actions">
        {state.status === "available" && (
          <button className="primary" onClick={onInstall}>
            <ChevronRight size={17} />
            Update
          </button>
        )}
        <button onClick={onDismiss} disabled={installing}>
          {isError ? "Dismiss" : "Later"}
        </button>
      </div>
    </motion.aside>
  );
}

function HomeDashboard({
  query,
  loading,
  onOpenSearch,
  continueItems,
  continueTotal,
  discovery,
  savedAnime,
  onOpenCatalog,
  onOpenAnime,
  onShowCatalog,
  onResumeHistory,
  onShowHistory,
  onShowMyList,
  onShowDownloads,
  downloadCount,
  session,
  onShowAdmin,
  onSignOut,
  myList,
  onToggleFavorite,
  onRemoveHistory,
}: {
  query: string;
  loading: boolean;
  onOpenSearch: () => void;
  continueItems: WatchHistory[];
  continueTotal: number;
  discovery: DiscoveryCatalog | null;
  savedAnime: Anime[];
  onOpenCatalog: (anime: CatalogAnime) => void;
  onOpenAnime: (anime: Anime) => void;
  onShowCatalog: () => void;
  onResumeHistory: (item: WatchHistory) => void;
  onShowHistory?: () => void;
  onShowMyList: () => void;
  onShowDownloads: () => void;
  downloadCount: number;
  session: SessionUser;
  onShowAdmin?: () => void;
  onSignOut?: () => void;
  myList: Favorite[];
  onToggleFavorite: (anime: Anime) => void;
  onRemoveHistory: (item: WatchHistory) => void;
}) {
  return (
    <section className="home-dashboard">
      <img className="home-stage-watermark" src={LOGO_SRC} alt="" aria-hidden="true" />
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
            <p className="home-command-kicker"><Sparkles size={14} /> Your red-carpet watchlist</p>
            <span>ani-desk</span>
            <small>Discover. Choose a source. Watch.</small>
          </div>
        </motion.div>
        <motion.div className="home-command-actions" variants={fadeUpVariant}>
          <motion.button
            layoutId="app-search-shell"
            className="hero-search-trigger home-command-search"
            transition={{ layout: { type: "spring", stiffness: 420, damping: 38, mass: 0.78 } }}
            whileTap={{ scale: 0.992 }}
            onClick={onOpenSearch}
          >
            <Search size={20} />
            <span>{query.trim() || "Search anime, films, OVAs..."}</span>
            {loading ? <Loader2 className="spin" size={18} /> : <ChevronRight size={19} />}
          </motion.button>
          <p className="home-command-hint">Pick a language, choose a provider, and keep the same search while you compare sources.</p>
          <div className="home-command-shortcuts">
            <button onClick={onShowMyList}><Star size={16} /> My List</button>
            {!session.hosted && <button onClick={onShowDownloads}><HardDrive size={16} /> Downloads <span>{downloadCount}</span></button>}
            {onShowAdmin && <button onClick={onShowAdmin}><ShieldCheck size={16} /> Users</button>}
            {onSignOut && <button onClick={onSignOut}><LogOut size={16} /> Sign out {session.username}</button>}
          </div>
        </motion.div>
      </motion.div>

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
        <CatalogRow
          title="Trending Now"
          items={discovery?.trending ?? []}
          loading={!discovery}
          onOpen={onOpenCatalog}
          onShowMore={onShowCatalog}
        />
        <AnimeRow
          title="My List"
          items={savedAnime}
          onOpen={onOpenAnime}
          onShowMore={onShowMyList}
          myList={myList}
          onToggleFavorite={onToggleFavorite}
          onRemove={onToggleFavorite}
          emptyTitle="Your list is empty"
          emptySubtitle="Search and add titles to keep them here."
        />
      </div>
    </section>
  );
}

function CatalogRow({
  title,
  items,
  loading,
  onOpen,
  controls,
  onShowMore,
  emptyTitle,
  emptySubtitle,
}: {
  title: string;
  items: CatalogAnime[];
  loading?: boolean;
  onOpen: (anime: CatalogAnime) => void;
  controls?: ReactNode;
  onShowMore?: () => void;
  emptyTitle?: string;
  emptySubtitle?: string;
}) {
  return (
    <motion.section className="content-row catalog-row" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="row-heading"><h2>{title}</h2>{controls}{onShowMore && <button onClick={onShowMore}>Show More <ChevronRight size={17} /></button>}</div>
      <div className={items.length || loading ? "card-row" : "card-row empty-row"}>
        {loading
          ? Array.from({ length: 9 }).map((_, index) => <div className="catalog-card skeleton" key={index} />)
          : items.length ? items.map((anime, index) => (
            <motion.button
              className="catalog-card"
              key={anime.catalogId}
              onClick={() => onOpen(anime)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.025, 0.15) }}
            >
              <img src={anime.coverUrl || LOGO_SRC} alt="" />
              <span>{anime.title}</span>
              <small>{anime.personalMatch != null ? `${anime.personalMatch}% match` : anime.score ? `${anime.score}% score` : anime.format || "Anime"}</small>
            </motion.button>
          )) : <ShelfEmptyCard title={emptyTitle || "Nothing here yet"} subtitle={emptySubtitle || "Try another catalog filter."} />}
      </div>
    </motion.section>
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
      <div className={items.length ? "card-row" : "card-row empty-row"}>
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
      <div className={loading || items.length ? "card-row" : "card-row empty-row"}>
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
      <img src={LOGO_SRC} alt="" />
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

function CatalogPage({
  genres,
  onBack,
  onOpen,
}: {
  genres: string[];
  onBack: () => void;
  onOpen: (anime: CatalogAnime) => void;
}) {
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [sort, setSort] = useState("personalMatch");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CatalogAnime[]>([]);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.getCatalog(filters, sort, page)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setHasNextPage(result.hasNextPage);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [filters.genre, filters.season, filters.year, filters.format, filters.status, sort, page]);

  function updateFilter<K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value || undefined }));
  }

  return (
    <motion.section className="catalog-browser" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
      <header className="catalog-browser-header">
        <IconButton label="Back" onClick={onBack}><ArrowLeft size={21} /></IconButton>
        <div><span>Discover</span><h1>Trending catalog</h1></div>
        <select value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }} aria-label="Sort catalog">
          <option value="personalMatch">Personal Match</option>
          <option value="trending">Trending</option>
          <option value="popularity">Popularity</option>
          <option value="score">AniList Score</option>
          <option value="newest">Newest</option>
          <option value="title">Title</option>
        </select>
      </header>
      <div className="catalog-filter-bar">
        <select value={filters.genre || ""} onChange={(event) => updateFilter("genre", event.target.value)} aria-label="Genre">
          <option value="">All genres</option>
          {genres.map((genre) => <option value={genre} key={genre}>{genre}</option>)}
        </select>
        <select value={filters.season || ""} onChange={(event) => updateFilter("season", event.target.value)} aria-label="Season">
          <option value="">All seasons</option><option value="WINTER">Winter</option><option value="SPRING">Spring</option><option value="SUMMER">Summer</option><option value="FALL">Fall</option>
        </select>
        <select value={filters.year || ""} onChange={(event) => updateFilter("year", event.target.value ? Number(event.target.value) : null)} aria-label="Year">
          <option value="">All years</option>
          {Array.from({ length: 15 }, (_, index) => currentYear - index).map((year) => <option value={year} key={year}>{year}</option>)}
        </select>
        <select value={filters.format || ""} onChange={(event) => updateFilter("format", event.target.value)} aria-label="Format">
          <option value="">All formats</option><option value="TV">TV</option><option value="MOVIE">Movie</option><option value="OVA">OVA</option><option value="ONA">ONA</option><option value="TV_SHORT">Short</option>
        </select>
        <select value={filters.status || ""} onChange={(event) => updateFilter("status", event.target.value)} aria-label="Status">
          <option value="">All statuses</option><option value="RELEASING">Releasing</option><option value="FINISHED">Finished</option><option value="NOT_YET_RELEASED">Upcoming</option>
        </select>
      </div>
      <div className="catalog-grid" aria-busy={loading}>
        {loading
          ? Array.from({ length: 12 }, (_, index) => <div className="catalog-card skeleton" key={index} />)
          : items.map((anime) => (
            <button className="catalog-card" key={anime.catalogId} onClick={() => onOpen(anime)}>
              <img src={anime.coverUrl || LOGO_SRC} alt="" />
              <span>{anime.title}</span>
              <small>{anime.personalMatch != null ? `${anime.personalMatch}% match` : anime.score ? `${anime.score}% score` : anime.format || "Anime"}</small>
            </button>
          ))}
      </div>
      <footer className="catalog-pagination">
        <button disabled={page === 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
        <span>Page {page}</span>
        <button disabled={!hasNextPage || loading} onClick={() => setPage((value) => value + 1)}>Next</button>
      </footer>
    </motion.section>
  );
}

function SearchStage({
  query,
  results,
  providerResults,
  catalogError,
  loading,
  sources,
  languageGroup,
  availability,
  selectedSource,
  selectedCatalog,
  selectedAnime,
  onQueryChange,
  onSearch,
  onLanguageChange,
  onProviderSelect,
  onProviderSourceSelect,
  onOpenProviderAccess,
  onCompleteProviderVerification,
  providerAccessPending,
  onSelectProviderResult,
  onSelectCatalog,
  onOpenAnime,
  onDownload,
  onToggleMyList,
  onBack,
  myList,
}: {
  query: string;
  results: CatalogAnime[];
  providerResults: Anime[];
  catalogError: AppError | null;
  loading: boolean;
  sources: Source[];
  languageGroup: "english" | "vietnamese";
  availability: ProviderAvailability[];
  selectedSource: Source | null;
  selectedCatalog: CatalogAnime | null;
  selectedAnime: Anime | null;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onLanguageChange: (language: "english" | "vietnamese") => void;
  onProviderSelect: (option: ProviderAvailability) => void;
  onProviderSourceSelect: (source: Source) => void;
  onOpenProviderAccess: (source: Source) => void;
  onCompleteProviderVerification: (source: Source) => void;
  providerAccessPending: string | null;
  onSelectProviderResult: (anime: Anime) => void;
  onSelectCatalog: (anime: CatalogAnime) => void;
  onOpenAnime: (anime: Anime) => void;
  onDownload: (anime: Anime) => void;
  onToggleMyList: (anime: Anime) => void;
  onBack: () => void;
  myList: Favorite[];
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewImage =
    selectedCatalog?.bannerUrl ||
    selectedAnime?.bannerUrl ||
    selectedCatalog?.coverUrl ||
    selectedAnime?.coverUrl ||
    LOGO_SRC;
  const languageSources = sources.filter((source) => source.languageGroup === languageGroup);
  const previewTitle = selectedCatalog?.title ?? selectedAnime?.title ?? "";
  const previewDescription = selectedCatalog?.description ?? selectedAnime?.synopsis ?? "";
  const previewMeta = selectedCatalog
    ? {
        episodes: selectedCatalog.totalEpisodes,
        category: selectedCatalog.genres.slice(0, 2).join(" / ") || selectedCatalog.format || "Uncategorized",
      }
    : {
        episodes: selectedAnime?.totalEpisodes,
        category: selectedAnime?.provider ?? "Provider result",
      };
  const recoverySource = selectedSource?.status === "unavailable" && (selectedSource.verificationUrl || selectedSource.websiteUrl)
    ? selectedSource
    : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <motion.section
      className="search-stage"
      initial={{ opacity: 0, scale: 0.975, y: 22, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.982, y: 16, filter: "blur(8px)" }}
      transition={{ type: "spring", stiffness: 340, damping: 34, mass: 0.82 }}
    >
      <img className="search-stage-watermark" src={LOGO_SRC} alt="" aria-hidden="true" />
      <div className="search-command-panel">
        <div className="search-header">
          <IconButton label="Back" onClick={onBack}>
            <ArrowLeft size={21} />
          </IconButton>
          <motion.div
            layoutId="app-search-shell"
            className="search-input-shell"
            transition={{ layout: { type: "spring", stiffness: 420, damping: 38, mass: 0.78 } }}
          >
            <Search size={20} />
            <input
              ref={inputRef}
              value={query}
              placeholder="Search anime, films, OVAs..."
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSearch();
              }}
            />
            {loading && <Loader2 className="spin" size={19} />}
          </motion.div>
        </div>
        <div className="search-source-row">
          <div className="language-switch" aria-label="Subtitle language">
            <button className={languageGroup === "english" ? "active" : ""} onClick={() => onLanguageChange("english")}>🇺🇸 English</button>
            <button className={languageGroup === "vietnamese" ? "active" : ""} onClick={() => onLanguageChange("vietnamese")}>🇻🇳 Vietnamese</button>
          </div>
          <div className="availability-strip" aria-label="Available providers">
            {languageSources.map((source) => {
              const option = availability.find((item) => item.provider === source.name);
              const hasDirectResult = providerResults.some((anime) => anime.provider === source.name);
              const recoverable = Boolean(source.verificationUrl || source.websiteUrl);
              const enabled = source.capabilities.search && (source.status !== "unavailable" || recoverable);
              const isActive = selectedSource?.name === source.name || selectedAnime?.provider === source.name;
              return (
                <button
                  key={source.name}
                  className={isActive ? "provider-chip active" : "provider-chip"}
                  disabled={!enabled}
                  title={source.failureCode || option?.failureCode || undefined}
                  onClick={() => onProviderSourceSelect(source)}
                >
                  <i className={`health-dot ${source.status}`} />
                  <strong>{source.name}</strong>
                  <span>{source.status === "unavailable" && source.verificationUrl ? "Verify / Xác minh" : enabled ? (hasDirectResult ? "Results" : "Search") : "Unavailable"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {recoverySource && (
        <aside className="provider-recovery" aria-live="polite">
          <div className="provider-recovery-icon"><AlertTriangle size={20} /></div>
          <div>
            <strong>{recoverySource.verificationUrl ? "Provider verification / Xác minh nguồn" : "Provider website / Trang nguồn"}</strong>
            <p>
              {recoverySource.verificationUrl
                ? `Open ${recoverySource.name}, complete Cloudflare manually, then return here and retry. Mở ${recoverySource.name}, tự hoàn tất Cloudflare, sau đó quay lại và thử lại.`
                : `${recoverySource.name} cannot play inside ani-desk right now. Open its website as a fallback. Hiện chưa thể phát ${recoverySource.name} trong ani-desk; hãy mở trang nguồn để xem thủ công.`}
            </p>
          </div>
          <div className="provider-recovery-actions">
            <button
              onClick={() => onOpenProviderAccess(recoverySource)}
              disabled={providerAccessPending !== null}
            >
              {providerAccessPending === `open:${recoverySource.name}` ? <Loader2 className="spin" size={16} /> : null}
              Open site / Mở trang
            </button>
            {recoverySource.verificationUrl && (
              <button
                className="primary"
                onClick={() => onCompleteProviderVerification(recoverySource)}
                disabled={providerAccessPending !== null}
              >
                {providerAccessPending === `retry:${recoverySource.name}` ? <Loader2 className="spin" size={16} /> : null}
                I finished — retry / Đã xong — thử lại
              </button>
            )}
          </div>
        </aside>
      )}

      {query.trim().length < 2 && !recoverySource && (
        <motion.section
          className="search-welcome"
          initial={{ opacity: 0, y: 18, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.99 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.85 }}
        >
          <div className="search-welcome-brand">
            <div className="search-welcome-logo-wrap">
              <img src={LOGO_SRC} alt="ani-desk" />
            </div>
            <div className="search-welcome-copy">
              <p className="search-welcome-kicker"><Sparkles size={15} /> Search across your favorite sources</p>
              <h1>Find the story you want tonight.</h1>
              <p>Start with two letters. ani-desk keeps your query in place while you switch language and provider.</p>
              <div className="search-suggestions" aria-label="Search suggestions">
                {["One Piece", "Naruto", "Your Name"].map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => {
                      onQueryChange(suggestion);
                      inputRef.current?.focus();
                    }}
                  >
                    <Search size={15} />
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="search-tip-grid">
            <article>
              <Film size={19} />
              <div><strong>Search provider-first</strong><span>Choose the source you trust, then compare without retyping.</span></div>
            </article>
            <article>
              <SlidersHorizontal size={19} />
              <div><strong>Match your subtitles</strong><span>Switch between English and Vietnamese before opening a title.</span></div>
            </article>
            <article>
              <Download size={19} />
              <div><strong>Save an episode</strong><span>Open a result and use the download control beside any episode.</span></div>
            </article>
          </div>
        </motion.section>
      )}

      {query.trim().length >= 2 && (
        <div className="search-layout">
          <aside className="search-results-pane">
            <div className="pane-title">
              <span>{selectedSource ? `${selectedSource.name} Results` : "Choose Provider"}</span>
              <strong>{providerResults.length}</strong>
            </div>
            {providerResults.map((anime, index) => {
              const active = selectedAnime && !selectedCatalog && animeKey(selectedAnime.provider, selectedAnime.id) === animeKey(anime.provider, anime.id);
              return (
                <motion.button
                  className={active ? "search-result active" : "search-result"}
                  key={animeKey(anime.provider, anime.id)}
                  onClick={() => onSelectProviderResult(anime)}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 30,
                    delay: Math.min(index * 0.012, 0.12),
                  }}
                  whileHover={{ x: 2, y: -1 }}
                >
                  <img src={anime.coverUrl || LOGO_SRC} alt="" />
                  <span>{anime.title}</span>
                  <small>{anime.provider} / {anime.language}</small>
                </motion.button>
              );
            })}
            {catalogError && (
              <div className="inline-status">
                <strong>{catalogError.code}</strong>
                <span>{catalogError.message}</span>
              </div>
            )}
            {loading && !providerResults.length ? (
              Array.from({ length: 9 }).map((_, index) => <div className="result-skeleton" key={index} />)
            ) : (
              !providerResults.length && <EmptyPanel title={query.trim().length < 2 ? "ani-desk" : "No results"} compact />
            )}


          </aside>

          <AnimatePresence mode="wait">
            <motion.div
              className="search-preview"
              key={selectedCatalog?.catalogId ?? (selectedAnime ? animeKey(selectedAnime.provider, selectedAnime.id) : "empty")}
              initial={{ opacity: 0, scale: 0.985, x: 18 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.99, x: -18 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {selectedCatalog || selectedAnime ? (
                <>
                  <div className="preview-art" style={{ backgroundImage: `url(${previewImage})` }} />
                  <img className="preview-poster-fallback" src={selectedCatalog?.coverUrl || selectedAnime?.coverUrl || LOGO_SRC} alt="" />
                  <div className="preview-copy">
                    <p className="eyebrow">{selectedAnime ? `${selectedAnime.provider} / ${selectedAnime.language}` : "Catalog title"}</p>
                    <h1>{previewTitle}</h1>
                    <p>{plainDescription(previewDescription) || "No synopsis is available for this title."}</p>
                    <div className="preview-meta">
                      <span><Film size={16} /> {previewMeta.episodes ? `${previewMeta.episodes} episodes` : selectedCatalog?.format || "Title"}</span>
                      <span><SlidersHorizontal size={16} /> {previewMeta.category}</span>
                    </div>
                    <div className="detail-actions">
                      <button className="primary" disabled={!selectedAnime} onClick={() => selectedAnime && onOpenAnime(selectedAnime)}>
                        <Play size={18} />
                        {selectedAnime ? "Open" : "Unavailable"}
                      </button>
                      <button onClick={() => {
                        const current = selectedAnime ?? catalogOnlyAnime(selectedCatalog!);
                        onToggleMyList(current);
                      }}>
                        {(() => {
                          const current = selectedAnime ?? catalogOnlyAnime(selectedCatalog!);
                          const isFavorite = current.isFavorite || myList.some((item) => item.animeId === animeKey(current.provider, current.id));
                          return (
                            <>
                              <Star size={18} fill={isFavorite ? "var(--red)" : "none"} style={{ color: "var(--red)" }} />
                              {isFavorite ? "In My List" : "My List"}
                            </>
                          );
                        })()}
                      </button>
                      <button
                        disabled={!selectedAnime}
                        aria-label="Choose an episode to download"
                        title="Choose an episode to download"
                        onClick={() => selectedAnime && onDownload(selectedAnime)}
                      >
                        <Download size={18} />
                        Download
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

function DownloadsPage({
  downloads,
  activeDownloads,
  onBack,
  onOpen,
  onReveal,
  onDelete,
  onRefresh,
}: {
  downloads: DownloadRecord[];
  activeDownloads: Record<string, EpisodeDownloadState>;
  onBack: () => void;
  onOpen: (id: string) => void;
  onReveal: (id: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const active = Object.entries(activeDownloads)
    .filter(([, item]) => item.status !== "complete")
    .map(([key, item]) => ({ key, ...item }));
  const totalBytes = downloads.reduce((total, item) => total + item.bytesDownloaded, 0);
  const availableCount = downloads.filter((item) => item.fileExists).length;

  return (
    <motion.section
      className="downloads-page"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
    >
      <header className="downloads-header">
        <IconButton label="Back" onClick={onBack}>
          <ArrowLeft size={21} />
        </IconButton>
        <div>
          <p className="eyebrow">Offline library</p>
          <h1>Downloads</h1>
          <p>Episodes saved on this device, ready without opening a provider again.</p>
        </div>
        <button className="downloads-refresh" onClick={onRefresh}>
          <HardDrive size={17} /> Refresh library
        </button>
      </header>

      <div className="download-summary-grid">
        <article>
          <span>On this device</span>
          <strong>{availableCount}</strong>
          <small>{downloads.length === availableCount ? "All files available" : `${downloads.length - availableCount} file${downloads.length - availableCount === 1 ? "" : "s"} missing`}</small>
        </article>
        <article>
          <span>Storage used</span>
          <strong>{formatBytes(totalBytes)}</strong>
          <small>Managed inside your ani-desk Downloads folder</small>
        </article>
        <article>
          <span>Activity</span>
          <strong>{active.length || "Quiet"}</strong>
          <small>{active.length ? `${active.length} transfer${active.length === 1 ? "" : "s"} need attention` : "No active transfers"}</small>
        </article>
      </div>

      {active.length > 0 && (
        <section className="download-section">
          <div className="download-section-heading">
            <div><p className="eyebrow">Transfer center</p><h2>In progress</h2></div>
            <span>{active.length}</span>
          </div>
          <div className="download-active-list">
            {active.map((item) => (
              <article className={`download-active-card ${item.status}`} key={item.key}>
                <div className="download-cover">
                  <img src={item.coverUrl || LOGO_SRC} alt="" />
                  {item.status === "error" ? <AlertTriangle size={20} /> : <Download size={20} />}
                </div>
                <div className="download-copy">
                  <span>{item.provider || "ani-desk"}</span>
                  <strong>{item.animeTitle || "Preparing episode"}</strong>
                  <small>{episodeLabel(item.episodeNumber ?? 0, item.episodeTitle)}</small>
                  <div className="download-progress-track"><i style={{ width: `${item.progress}%` }} /></div>
                  <p>{item.message || (item.status === "error" ? "Download needs attention" : "Downloading…")}</p>
                </div>
                <b>{Math.round(item.progress)}%</b>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="download-section completed-downloads">
        <div className="download-section-heading">
          <div><p className="eyebrow">Local episodes</p><h2>Completed</h2></div>
          <span>{downloads.length}</span>
        </div>
        {downloads.length ? (
          <div className="download-library-list">
            {downloads.map((item) => (
              <motion.article layout className={item.fileExists ? "download-library-row" : "download-library-row missing"} key={item.id}>
                <img src={item.coverUrl || LOGO_SRC} alt="" />
                <div className="download-library-copy">
                  <span>{item.provider} · {formatDownloadDate(item.completedAt)}</span>
                  <strong>{item.animeTitle}</strong>
                  <small>{episodeLabel(item.episodeNumber, item.episodeTitle)} · {formatBytes(item.bytesDownloaded)}</small>
                  {!item.fileExists && <em>File moved or removed outside ani-desk</em>}
                </div>
                <div className="download-library-actions">
                  <button className="primary" disabled={!item.fileExists} onClick={() => onOpen(item.id)}>
                    <Play size={16} fill="currentColor" /> Play
                  </button>
                  <button disabled={!item.fileExists} onClick={() => onReveal(item.id)} title="Show in Finder or Explorer">
                    <FolderOpen size={17} /> <span>Show</span>
                  </button>
                  <button
                    className={deleteConfirmation === item.id ? "danger confirm" : "danger"}
                    onClick={() => {
                      if (deleteConfirmation === item.id) {
                        onDelete(item.id);
                        setDeleteConfirmation(null);
                      } else {
                        setDeleteConfirmation(item.id);
                      }
                    }}
                    title="Delete local file"
                  >
                    <Trash2 size={17} /> <span>{deleteConfirmation === item.id ? "Delete?" : "Delete"}</span>
                  </button>
                </div>
              </motion.article>
            ))}
          </div>
        ) : (
          <div className="downloads-empty">
            <div><Download size={28} /></div>
            <h3>No offline episodes yet</h3>
            <p>Open an anime and use its download button. Finished episodes will collect here automatically.</p>
          </div>
        )}
      </section>
    </motion.section>
  );
}

function AdminPage({ currentUser, onBack }: { currentUser: SessionUser; onBack: () => void }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [creating, setCreating] = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      setUsers(await api.listUsers());
      setMessage(null);
    } catch (err) {
      setMessage(toAppError(err, "admin-users").message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setMessage(null);
    try {
      await api.createUser({ username: username.trim(), password, role });
      setUsername("");
      setPassword("");
      setRole("user");
      await loadUsers();
    } catch (err) {
      setMessage(toAppError(err, "admin-users").message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <motion.section className="admin-page" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <header className="admin-header">
        <IconButton label="Back" onClick={onBack}><ArrowLeft size={21} /></IconButton>
        <div><p className="eyebrow">Administrator</p><h1>People & access</h1><p>Create accounts and control who can use this ani-desk web space.</p></div>
        <div className="admin-current-user"><ShieldCheck size={17} /><span>{currentUser.username}</span><small>Administrator</small></div>
      </header>

      <div className="admin-layout">
        <form className="admin-create-card" onSubmit={(event) => void createAccount(event)}>
          <div className="admin-card-heading"><div><p className="eyebrow">New account</p><h2>Invite a viewer</h2></div><UserPlus size={22} /></div>
          <label><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={40} autoComplete="off" /></label>
          <label><span>Temporary password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} autoComplete="new-password" /></label>
          <label><span>Access level</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="user">Viewer</option><option value="admin">Administrator</option></select></label>
          <button className="primary" disabled={creating || username.trim().length < 3 || password.length < 10}>{creating ? <Loader2 className="spin" size={17} /> : <UserPlus size={17} />}{creating ? "Creating…" : "Create account"}</button>
          <small>Passwords are hashed before storage. The password cannot be viewed again after creation.</small>
        </form>

        <section className="admin-users-card">
          <div className="admin-card-heading"><div><p className="eyebrow">Directory</p><h2>{users.length} account{users.length === 1 ? "" : "s"}</h2></div><Users size={22} /></div>
          {message && <p className="admin-message"><AlertTriangle size={16} />{message}</p>}
          {loading ? <div className="admin-loading"><Loader2 className="spin" /> Loading accounts…</div> : (
            <div className="admin-user-list">
              {users.map((user) => <AdminUserRow key={user.id} user={user} isCurrent={user.id === currentUser.id} onSaved={loadUsers} onError={setMessage} />)}
            </div>
          )}
        </section>
      </div>
    </motion.section>
  );
}

function AdminUserRow({
  user,
  isCurrent,
  onSaved,
  onError,
}: {
  user: ManagedUser;
  isCurrent: boolean;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [enabled, setEnabled] = useState(user.enabled);
  const [username, setUsername] = useState(user.username);
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = username.trim() !== user.username || enabled !== user.enabled || role !== user.role || password.length > 0;

  return (
    <article className={`admin-user-row${enabled ? "" : " disabled"}${user.protected ? " protected" : ""}`}>
      <div className="admin-user-avatar">{user.username.slice(0, 2).toUpperCase()}</div>
      <label className="admin-user-name">
        <span className="sr-only">Username</span>
        <input className="admin-username" value={username} disabled={user.protected} minLength={3} maxLength={40} autoComplete="off" onChange={(event) => setUsername(event.target.value)} aria-label={`Username for ${user.username}`} />
        <small>{user.protected ? "Protected administrator account" : isCurrent ? "Current session" : `Created ${formatDownloadDate(user.createdAt)}`}</small>
      </label>
      <select value={role} disabled={user.protected || isCurrent} onChange={(event) => setRole(event.target.value as "admin" | "user")} aria-label={`Role for ${user.username}`}><option value="user">Viewer</option><option value="admin">Admin</option></select>
      <label className="admin-enabled"><input type="checkbox" checked={enabled} disabled={user.protected || isCurrent} onChange={(event) => setEnabled(event.target.checked)} /><span>{enabled ? "Active" : "Disabled"}</span></label>
      <input className="admin-reset-password" type="password" value={password} disabled={user.protected} onChange={(event) => setPassword(event.target.value)} placeholder={user.protected ? "Managed by server configuration" : "New password (optional)"} minLength={10} autoComplete="new-password" aria-label={`New password for ${user.username}`} />
      <button
        disabled={user.protected || !dirty || saving || username.trim().length < 3 || (password.length > 0 && password.length < 10)}
        onClick={() => {
          setSaving(true);
          onError(null);
          void api.updateUser(user.id, { username: username.trim(), enabled, role, password: password || undefined })
            .then(() => { setPassword(""); return onSaved(); })
            .catch((err) => onError(toAppError(err, "admin-users").message))
            .finally(() => setSaving(false));
        }}
      >
        {saving ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Save
      </button>
    </article>
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
        <small>{episodeLabel(item.episodeNumber, item.episodeTitle, " / ")}</small>
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
  onDownload,
  downloadStates,
}: {
  anime: Anime;
  episodes: Episode[];
  loading: boolean;
  isFavorite: boolean;
  resumeHistory?: WatchHistory;
  onBack: () => void;
  onToggleMyList: () => void;
  onPlay: (episode: Episode, startTime?: number) => void;
  onDownload: (episode: Episode) => void;
  downloadStates: Record<string, EpisodeDownloadState>;
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
  const bannerDownloadEpisode = resumeEpisode ?? firstEpisode;
  const bannerDownloadState = bannerDownloadEpisode
    ? downloadStates[episodeDownloadKey(anime, bannerDownloadEpisode)]
    : undefined;

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
      initial={{ opacity: 0, scale: 0.975, y: 22, filter: "blur(10px)" }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.985, y: 14, filter: "blur(8px)" }}
      transition={{ type: "spring", stiffness: 330, damping: 34, mass: 0.85 }}
    >
      <div className="detail-page-shell">
        <IconButton label="Back" className="detail-back-button" onClick={onBack}>
          <ArrowLeft size={21} />
        </IconButton>
        <div className="detail-chooser-grid" style={{ "--detail-bg": `url(${anime.bannerUrl || anime.coverUrl || LOGO_SRC})` } as React.CSSProperties}>
          <aside className="episode-range-panel">
            <div className="episode-range-heading">
              <p className="eyebrow">{anime.provider}</p>
              <h3>Ranges</h3>
              <span>{episodes.length} total</span>
            </div>
            {resumeEpisode && (
              <button className="episode-resume-jump" onClick={() => focusEpisode(resumeEpisode)}>
                <Clock size={15} />
                E{resumeEpisode.number} at {formatTime(resumeHistory?.positionSeconds ?? 0)}
              </button>
            )}
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
          </aside>

          <section className="episode-panel episode-list-panel">
            <div className="episode-heading">
              <div>
                <h3>Episodes</h3>
                <span>Range {activeRangeLabel} / {episodes.length} total</span>
              </div>
              <div className="episode-heading-actions">
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
                    const downloadState = downloadStates[episodeDownloadKey(anime, episode)];
                    const downloadBusy = downloadState?.status === "preparing" || downloadState?.status === "downloading";
                    return (
                      <motion.div
                        className={`episode-list-row${episode.thumbnail ? " has-thumbnail" : ""}${isResume ? " watched" : ""}${highlighted ? " highlighted" : ""}`}
                        key={episode.id}
                        data-episode-number={episode.number}
                        role="button"
                        tabIndex={0}
                        onClick={() => onPlay(episode, isResume ? resumeHistory?.positionSeconds ?? 0 : 0)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            if (event.target !== event.currentTarget) return;
                            event.preventDefault();
                            onPlay(episode, isResume ? resumeHistory?.positionSeconds ?? 0 : 0);
                          }
                        }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.995 }}
                      >
                        <span className="episode-thumb">
                          {episode.thumbnail ? <img src={episode.thumbnail} alt="" loading="lazy" /> : <Play size={18} />}
                        </span>
                        <span className="episode-row-copy">
                          <strong>Episode {episode.number}</strong>
                          <small>{episodeTitleDetail(episode.title, episode.number) || "Ready to play"}</small>
                        </span>
                        {isResume && <span className="episode-resume-pill">Resume</span>}
                        <button
                          className={`episode-download-button ${downloadState?.status || "idle"}`}
                          disabled={downloadBusy}
                          aria-label={`Download Episode ${episode.number}`}
                          title={downloadState?.message || `Download Episode ${episode.number}`}
                          style={{ "--download-progress": `${downloadState?.progress ?? 0}%` } as React.CSSProperties}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDownload(episode);
                          }}
                        >
                          {downloadBusy ? <Loader2 className="spin" size={17} /> : downloadState?.status === "complete" ? <Check size={17} /> : <Download size={17} />}
                        </button>
                        <Play className="episode-play-icon" size={18} fill="currentColor" />
                      </motion.div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
          </section>

          <aside className="detail-info-panel">
            <div className="detail-poster-stage">
              <div className="detail-poster-glow" style={{ backgroundImage: `url(${anime.bannerUrl || anime.coverUrl || LOGO_SRC})` }} />
              <img src={anime.coverUrl || LOGO_SRC} alt="" />
            </div>
            <div className="detail-info-copy">
              <p className="eyebrow">{anime.provider} / {anime.language}</p>
              <h2>{anime.title}</h2>
              <p>{anime.synopsis || "Episodes are loaded directly from the selected source."}</p>
              <div className="preview-meta">
                <span><Film size={16} /> {episodes.length || anime.totalEpisodes || 0} episodes</span>
                <span><SlidersHorizontal size={16} /> {activeRangeLabel}</span>
              </div>
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
                <button
                  className={bannerDownloadState?.status === "complete" ? "download-complete" : ""}
                  disabled={!bannerDownloadEpisode || bannerDownloadState?.status === "preparing" || bannerDownloadState?.status === "downloading"}
                  title={bannerDownloadState?.message || "Save this episode to Downloads/ani-desk"}
                  onClick={() => bannerDownloadEpisode && onDownload(bannerDownloadEpisode)}
                >
                  {bannerDownloadState?.status === "preparing" || bannerDownloadState?.status === "downloading"
                    ? <Loader2 className="spin" size={18} />
                    : bannerDownloadState?.status === "complete"
                      ? <Check size={18} />
                      : <Download size={18} />}
                  {bannerDownloadState?.status === "complete"
                    ? "Downloaded"
                    : `Download E${bannerDownloadEpisode?.number ?? ""}`}
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
              {bannerDownloadState?.message && (
                <p className={`download-status-line ${bannerDownloadState.status}`} title={bannerDownloadState.message}>
                  {bannerDownloadState.status === "complete"
                    ? bannerDownloadState.message
                    : `${Math.round(bannerDownloadState.progress)}% · ${bannerDownloadState.message}`}
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </motion.section>
  );
}

function VideoPlayer({ context, onClose }: { context: PlayerContext; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const dashRef = useRef<MediaPlayerClass | null>(null);
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
  const streamIsDash = context.playback.streamKind === "dash" || context.playback.originalUrl.toLowerCase().includes(".mpd");
  const subtitleTracks = context.playback.subtitles.filter((item) => item.url);
  const [subtitle, setSubtitle] = useState(subtitleTracks.length ? "0" : "off");

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
    dashRef.current?.reset();
    dashRef.current = null;
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

    if (streamIsDash) {
      void import("dashjs").then((dashjs) => {
        if (disposed) return;
        const player = dashjs.MediaPlayer().create();
        dashRef.current = player;
        player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
          if (disposed) return;
          const representations = player.getRepresentationsByType("video");
          setLevels(representations.map((representation, index) => ({
            index,
            id: representation.id,
            label: formatDashRepresentation(representation, index),
          })));
          applyDashQuality(player, representations, qualityRef.current);
          startPlayback();
        });
        player.on(dashjs.MediaPlayer.events.ERROR, (event) => {
          if (disposed) return;
          const message = "error" in event && event.error
            ? ` (${String(event.error)})`
            : "";
          setError(`The browser player failed to load this DASH stream${message}. Try the fallback player.`);
        });
        player.initialize(video, context.playback.playbackUrl, false, context.startTime || undefined);
      }).catch((loadError) => {
        if (!disposed) setError(`The DASH player could not start (${String(loadError)}).`);
      });
    } else if (streamIsHls) {
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
      dashRef.current?.reset();
      dashRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [context.playback.playbackUrl, context.playback.originalUrl, context.playback.streamKind, context.startTime, streamIsDash, streamIsHls]);

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
    if (dashRef.current) {
      applyDashQuality(
        dashRef.current,
        dashRef.current.getRepresentationsByType("video"),
        nextQuality,
      );
    }
  }

  async function saveProgress(force = false) {
    const video = videoRef.current;
    if (!video) return;
    const now = Date.now();
    if (!force && now - savingAtRef.current < 5000) return;
    savingAtRef.current = now;
    await api.saveProgress({
      animeId: animeKey(context.anime.provider, context.anime.id),
      catalogId: context.anime.catalogId ?? null,
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

  function changeSubtitle(value: string) {
    setSubtitle(value);
    const tracks = videoRef.current?.textTracks;
    if (!tracks) return;
    for (let index = 0; index < tracks.length; index += 1) {
      tracks[index].mode = value === String(index) ? "showing" : "disabled";
    }
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

  async function togglePictureInPicture() {
    const video = videoRef.current;
    if (!video) return;
    const pipDocument = document as Document & {
      pictureInPictureElement?: Element | null;
      exitPictureInPicture?: () => Promise<void>;
    };
    const pipVideo = video as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
      webkitSetPresentationMode?: (mode: "inline" | "picture-in-picture") => void;
      webkitPresentationMode?: string;
    };

    if (pipDocument.pictureInPictureElement && pipDocument.exitPictureInPicture) {
      await pipDocument.exitPictureInPicture().catch(() => undefined);
    } else if (pipVideo.requestPictureInPicture) {
      await pipVideo.requestPictureInPicture().catch(() => undefined);
    } else if (pipVideo.webkitSetPresentationMode) {
      pipVideo.webkitSetPresentationMode(
        pipVideo.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture",
      );
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
      initial={{ opacity: 0, scale: 0.985, filter: "blur(12px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.99, filter: "blur(10px)" }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={revealControls}
      onClick={revealControls}
    >
      <video
        ref={videoRef}
        autoPlay
        onTimeUpdate={() => void saveProgress()}
        onPause={() => void saveProgress(true)}
        onEnded={() => void saveProgress(true)}
        onDoubleClick={() => void toggleFullscreen()}
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
        <div className="player-leading-controls">
          <button onClick={() => void closePlayer()} aria-label="Back to episodes" title="Back to episodes">
            <ArrowLeft size={20} />
          </button>
          <button onClick={() => void togglePictureInPicture()} aria-label="Picture in Picture" title="Picture in Picture">
            <PictureInPicture2 size={20} />
          </button>
        </div>
      </div>

      <div className="player-volume-dock">
        <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
          {muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
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
        {error && (
          <div className="player-error-fallback">
            <span>{error}</span>
            {context.playback.canFallbackToMpv && <button onClick={() => void openMpv()}>Open fallback player</button>}
          </div>
        )}
        <div className="player-control-row">
          <div className="player-now-playing">
            <span>{context.anime.provider}</span>
            <strong>{context.anime.title}</strong>
            <small>{episodeLabel(context.episode.number, context.episode.title)}</small>
          </div>
          <div className="player-utility-pill">
            <button onClick={() => void toggleFullscreen()} aria-label="Toggle fullscreen" title="Toggle fullscreen">
              <Maximize2 size={18} />
            </button>
            <label title="Video quality">
              <span>Quality</span>
            <select value={quality} onChange={(event) => changeQuality(event.target.value)} disabled={(!streamIsHls && !streamIsDash) || !levels.length}>
              <option value="auto">Auto</option>
              {levels.map((level) => <option value={String(level.index)} key={level.index}>{level.label}</option>)}
            </select>
            </label>
            {subtitleTracks.length > 0 && (
              <label title="Subtitles">
                <span>Subtitles</span>
                <select value={subtitle} onChange={(event) => changeSubtitle(event.target.value)}>
                  <option value="off">Off</option>
                  {subtitleTracks.map((track, index) => <option value={String(index)} key={track.url}>{track.language}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
        <div className="player-timeline">
          <span>{formatTime(currentTime)}</span>
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
          <span>-{formatTime(Math.max(0, duration - currentTime))}</span>
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
    catalogId: item.catalogId ?? null,
    title: item.title,
    coverUrl: item.coverUrl,
    bannerUrl: null,
    language: "History",
    totalEpisodes: null,
    synopsis: null,
    isFavorite: myList.some((favorite) => favorite.animeId === item.animeId),
  };
}

function catalogToAnime(catalog: CatalogAnime, providerAnime: Anime): Anime {
  return {
    ...providerAnime,
    catalogId: catalog.catalogId,
    title: catalog.title || providerAnime.title,
    coverUrl: catalog.coverUrl || providerAnime.coverUrl,
    bannerUrl: catalog.bannerUrl || providerAnime.bannerUrl,
    totalEpisodes: providerAnime.totalEpisodes ?? catalog.totalEpisodes,
    synopsis: catalog.description || providerAnime.synopsis,
  };
}

function catalogOnlyAnime(catalog: CatalogAnime): Anime {
  return {
    id: String(catalog.catalogId),
    catalogId: catalog.catalogId,
    provider: "Catalog",
    title: catalog.title,
    coverUrl: catalog.coverUrl,
    bannerUrl: catalog.bannerUrl,
    language: "Catalog",
    totalEpisodes: catalog.totalEpisodes,
    synopsis: catalog.description,
    isFavorite: false,
  };
}

function firstSearchableSource(sources: Source[], group: "english" | "vietnamese") {
  return (
    sources.find((source) => source.languageGroup === group && source.status !== "unavailable" && source.capabilities.search) ??
    sources.find((source) => source.languageGroup === group) ??
    null
  );
}

function episodeDownloadKey(anime: Anime, episode: Episode) {
  return `${animeKey(anime.provider, anime.id)}:${episode.id}`;
}

function plainDescription(value?: string | null): string {
  if (!value) return "";
  const withBreaks = value.replace(/<br\s*\/?>/gi, "\n");
  if (typeof DOMParser === "undefined") {
    return withBreaks.replace(/<[^>]+>/g, "").replace(/&lt;br\s*\/??&gt;/gi, "\n").trim();
  }
  const document = new DOMParser().parseFromString(withBreaks, "text/html");
  return (document.body.textContent || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function formatDashRepresentation(representation: Representation, index: number) {
  if (representation.height) return `${representation.height}p`;
  if (representation.bitrateInKbit) return `${Math.round(representation.bitrateInKbit)} kbps`;
  return `Quality ${index + 1}`;
}

function applyDashQuality(
  player: MediaPlayerClass | null,
  representations: Representation[],
  quality: string,
) {
  if (!player) return;
  if (quality === "auto") {
    player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true } } } });
    return;
  }
  const representation = representations[Number(quality)];
  if (!representation) return;
  player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false } } } });
  player.setRepresentationForTypeById("video", representation.id, true);
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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function formatDownloadDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Saved locally";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(timestamp);
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toAppError(error: unknown, operation: string): AppError {
  if (error && typeof error === "object") {
    const value = error as Partial<AppError>;
    if (typeof value.code === "string" && typeof value.message === "string") {
      return {
        code: value.code,
        message: value.message,
        provider: value.provider ?? null,
        operation: value.operation || operation,
        retryable: Boolean(value.retryable),
        correlationId: value.correlationId || crypto.randomUUID(),
        technical: value.technical ?? null,
      };
    }
  }
  return {
    code: "UNEXPECTED_ERROR",
    message: errorMessage(error),
    operation,
    retryable: true,
    correlationId: crypto.randomUUID(),
  };
}

export default App;
