import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  Anime,
  AnimeDetails,
  CatalogAnime,
  CatalogFilters,
  CatalogPage,
  DiscoveryCatalog,
  DownloadEvent,
  DownloadResult,
  Episode,
  Favorite,
  Playback,
  ProviderAvailability,
  Source,
  WatchHistory,
} from "./types";

export const api = {
  listSources: () => invoke<Source[]>("list_sources"),
  listProviderHealth: () => invoke<Source[]>("list_provider_health"),
  retryProviderHealth: (provider?: string) =>
    invoke<Source[]>("retry_provider_health", { provider }),
  openProviderAccess: (provider: string) =>
    invoke<void>("open_provider_access", { provider }),
  completeProviderVerification: (provider: string) =>
    invoke<Source[]>("complete_provider_verification", { provider }),
  getDiscovery: () => invoke<DiscoveryCatalog>("get_discovery"),
  getGenreCatalog: (genre: string) =>
    invoke<CatalogAnime[]>("get_genre_catalog", { genre }),
  getCatalog: (filters: CatalogFilters, sort: string, page = 1) =>
    invoke<CatalogPage>("get_catalog", { filters, sort, page }),
  searchCatalog: (query: string) =>
    invoke<CatalogAnime[]>("search_catalog", { query }),
  resolveAvailability: (catalogId: number, title: string, languageGroupFilter?: string) =>
    invoke<ProviderAvailability[]>("resolve_availability", {
      catalogId,
      title,
      languageGroupFilter,
    }),
  getContinueWatching: (limit = 20) =>
    invoke<WatchHistory[]>("get_continue_watching", { limit }),
  getMyList: (limit = 100) => invoke<Favorite[]>("get_my_list", { limit }),
  searchSource: (source: string, query: string) =>
    invoke<Anime[]>("search_source", { source, query }),
  getAnimeDetails: (provider: string, animeId: string, title: string) =>
    invoke<AnimeDetails>("get_anime_details", { provider, animeId, title }),
  getEpisodes: (provider: string, animeId: string) =>
    invoke<Episode[]>("get_episodes", { provider, animeId }),
  preparePlayback: (provider: string, episodeId: string) =>
    invoke<Playback>("prepare_playback", { provider, episodeId }),
  downloadEpisode: (
    request: {
      provider: string;
      episodeId: string;
      animeTitle: string;
      episodeNumber: number;
      episodeTitle?: string | null;
    },
    onProgress: (event: DownloadEvent) => void,
  ) => {
    const onEvent = new Channel<DownloadEvent>();
    onEvent.onmessage = onProgress;
    return invoke<DownloadResult>("download_episode", { request, onEvent });
  },
  openInMpv: (provider: string, episodeId: string, startTime?: number) =>
    invoke<void>("open_in_mpv", {
      provider,
      episodeId,
      startTime: Math.max(0, Math.floor(startTime ?? 0)),
    }),
  saveProgress: (progress: {
    animeId: string;
    catalogId?: number | null;
    provider: string;
    title: string;
    coverUrl: string;
    episodeNumber: number;
    episodeTitle?: string | null;
    positionSeconds: number;
    totalSeconds: number;
  }) => invoke<void>("save_progress", { progress }),
  addToMyList: (anime: Anime) =>
    invoke<void>("add_to_my_list", {
      anime: {
        id: anime.id,
        catalogId: anime.catalogId ?? null,
        provider: anime.provider,
        title: anime.title,
        coverUrl: anime.coverUrl ?? "",
      },
    }),
  removeFromMyList: (animeId: string) =>
    invoke<void>("remove_from_my_list", { animeId }),
  removeContinueWatching: (animeId: string) =>
    invoke<void>("remove_continue_watching", { animeId }),
};

export const animeKey = (provider: string, id: string) => `${provider}:${id}`;

export const favoriteToAnime = (favorite: Favorite): Anime => ({
  id: favorite.animeId.includes(":")
    ? favorite.animeId.split(":").slice(1).join(":")
    : favorite.animeId,
  provider: favorite.provider,
  catalogId: favorite.catalogId ?? null,
  title: favorite.title,
  coverUrl: favorite.coverUrl,
  bannerUrl: null,
  language: "Saved",
  totalEpisodes: null,
  synopsis: null,
  isFavorite: true,
});
