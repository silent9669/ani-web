import { invoke } from "@tauri-apps/api/core";
import type { Anime, AnimeDetails, Episode, Favorite, Playback, Source, WatchHistory } from "./types";

export const api = {
  listSources: () => invoke<Source[]>("list_sources"),
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
  openInMpv: (provider: string, episodeId: string, startTime?: number) =>
    invoke<void>("open_in_mpv", {
      provider,
      episodeId,
      startTime: Math.max(0, Math.floor(startTime ?? 0)),
    }),
  saveProgress: (progress: {
    animeId: string;
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
        provider: anime.provider,
        title: anime.title,
        coverUrl: anime.coverUrl,
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
  title: favorite.title,
  coverUrl: favorite.coverUrl,
  bannerUrl: null,
  language: "Saved",
  totalEpisodes: null,
  synopsis: null,
  isFavorite: true,
});
