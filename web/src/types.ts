export type Source = {
  name: string;
  language: string;
  languageGroup: "english" | "vietnamese" | string;
  status: "healthy" | "degraded" | "unavailable" | "unknown" | string;
  failureCode?: string | null;
  capabilities: ProviderCapabilities;
  websiteUrl?: string | null;
  verificationUrl?: string | null;
};

export type ProviderCapabilities = {
  search: boolean;
  details: boolean;
  episodes: boolean;
  playback: boolean;
  subtitles: boolean;
};

export type CatalogAnime = {
  catalogId: number;
  title: string;
  nativeTitle?: string | null;
  description?: string | null;
  coverUrl: string;
  bannerUrl?: string | null;
  genres: string[];
  totalEpisodes?: number | null;
  score?: number | null;
  format?: string | null;
  seasonYear?: number | null;
  season?: string | null;
  status?: string | null;
  popularity?: number | null;
  trending?: number | null;
  personalMatch?: number | null;
};

export type CatalogFilters = {
  genre?: string | null;
  season?: string | null;
  year?: number | null;
  format?: string | null;
  status?: string | null;
};

export type CatalogPage = {
  items: CatalogAnime[];
  page: number;
  hasNextPage: boolean;
};

export type DiscoveryCatalog = {
  trending: CatalogAnime[];
  popularThisSeason: CatalogAnime[];
  genres: string[];
};

export type ProviderAvailability = {
  provider: string;
  language: string;
  status: "available" | "unavailable" | string;
  failureCode?: string | null;
  anime?: Anime | null;
};

export type AppError = {
  code: string;
  message: string;
  provider?: string | null;
  operation: string;
  retryable: boolean;
  correlationId: string;
  technical?: string | null;
};

export type Anime = {
  id: string;
  catalogId?: number | null;
  provider: string;
  title: string;
  coverUrl: string;
  bannerUrl?: string | null;
  language: string;
  totalEpisodes?: number | null;
  synopsis?: string | null;
  isFavorite: boolean;
};

export type AnimeDetails = {
  coverUrl?: string | null;
  bannerUrl?: string | null;
  totalEpisodes?: number | null;
  synopsis?: string | null;
};

export type Episode = {
  id: string;
  number: number;
  title?: string | null;
  thumbnail?: string | null;
};

export type WatchHistory = {
  animeId: string;
  catalogId?: number | null;
  provider: string;
  title: string;
  coverUrl: string;
  episodeNumber: number;
  episodeTitle?: string | null;
  positionSeconds: number;
  totalSeconds: number;
  updatedAt: string;
};

export type Favorite = {
  animeId: string;
  catalogId?: number | null;
  provider: string;
  title: string;
  coverUrl: string;
};

export type Playback = {
  sessionId: string;
  playbackUrl: string;
  originalUrl: string;
  streamKind: "hls" | "native" | string;
  subtitles: Array<{ language: string; url: string }>;
  qualities: string[];
  canFallbackToMpv: boolean;
};

export type PlayerContext = {
  anime: Anime;
  episode: Episode;
  episodes: Episode[];
  playback: Playback;
  startTime: number;
};
