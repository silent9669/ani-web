export type Source = {
  name: string;
  language: string;
};

export type Anime = {
  id: string;
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
