export interface DiscogsRelease {
  id: number;
  title: string;
  year: number;
  label: string;
  thumb: string;
  type: string;
  format: string;
  release_type: 'master' | 'release';
}

export interface DiscogsTrack {
  position: string;
  title: string;
  duration: string;
}

export interface DiscogsArtistCredit {
  name: string;
  role: string;
  id?: number;
}

export interface DiscogsReleaseDetail {
  id: number;
  title: string;
  year: number;
  genres: string[];
  styles: string[];
  tracklist: DiscogsTrack[];
  images: { uri: string; uri150: string; type: string }[];
  videos: { uri: string; title: string }[];
  notes: string;
  extraartists: DiscogsArtistCredit[];
  // from the artist releases list
  label: string;
  format: string;
}

interface DiscogsApiRelease {
  id: number;
  title: string;
  year?: number;
  label?: string;
  thumb?: string;
  type: string;
  role: string;
  format?: string;
  master_id?: number;
}

interface DiscogsApiResponse {
  releases: DiscogsApiRelease[];
  pagination: {
    pages: number;
    page: number;
  };
}

const DISCOGS_HEADERS = () => ({
  Authorization: `Discogs token=${import.meta.env.DISCOGS_TOKEN}`,
  'User-Agent': 'twinklebrothersmusic.com/1.0',
});

let cachedReleases: DiscogsRelease[] | null = null;
let cacheTime = 0;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

const detailCache = new Map<number, { data: DiscogsReleaseDetail; time: number }>();

export async function fetchDiscography(skipCache = false): Promise<DiscogsRelease[]> {
  const token = import.meta.env.DISCOGS_TOKEN;
  const artistId = import.meta.env.DISCOGS_ARTIST_ID;

  if (!token || !artistId) {
    console.warn('Discogs credentials not set (DISCOGS_TOKEN, DISCOGS_ARTIST_ID)');
    return [];
  }

  if (!skipCache && cachedReleases && Date.now() - cacheTime < CACHE_DURATION) {
    return cachedReleases;
  }

  try {
    const releases: DiscogsRelease[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const url = `https://api.discogs.com/artists/${artistId}/releases?sort=year&sort_order=asc&per_page=100&page=${page}`;
      const response = await fetch(url, { headers: DISCOGS_HEADERS() });

      if (!response.ok) {
        console.error(`Discogs API error: ${response.status} ${response.statusText}`);
        break;
      }

      const data: DiscogsApiResponse = await response.json();
      totalPages = data.pagination.pages;

      for (const release of data.releases) {
        if (release.role !== 'Main') continue;
        if (release.type === 'master') {
          // masters: always include
        } else if (!release.master_id) {
          // standalone release (no master) — only include if it's a single/EP, not an album/comp
          const fmt = (release.format ?? '').toLowerCase();
          const isAlbum = fmt.includes('lp') || fmt.includes('album') || fmt.includes('comp');
          if (isAlbum) continue;
        } else {
          continue; // has a master — covered by the master entry
        }
        releases.push({
          id: release.id,
          title: release.title,
          year: release.year ?? 0,
          label: release.label ?? '',
          thumb: release.thumb ?? '',
          type: release.type,
          format: release.format ?? '',
          release_type: release.type === 'master' ? 'master' : 'release',
        });
      }

      page++;
    }

    cachedReleases = releases;
    cacheTime = Date.now();

    return releases;
  } catch (error) {
    console.error('Error fetching Discogs discography:', error);
    return [];
  }
}

export async function fetchReleaseDetail(id: number, releaseType: 'master' | 'release' = 'master'): Promise<DiscogsReleaseDetail | null> {
  const token = import.meta.env.DISCOGS_TOKEN;
  if (!token) return null;

  const cached = detailCache.get(id);
  if (cached && Date.now() - cached.time < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const endpoint = releaseType === 'release'
      ? `https://api.discogs.com/releases/${id}`
      : `https://api.discogs.com/masters/${id}`;

    const response = await fetch(endpoint, { headers: DISCOGS_HEADERS() });

    if (!response.ok) {
      console.error(`Discogs fetch error (${releaseType} ${id}): ${response.status}`);
      return null;
    }

    const raw = await response.json();
    const listEntry = cachedReleases?.find(r => r.id === id);

    // For masters: also fetch the main release to get extraartists/credits
    let extraartists: DiscogsArtistCredit[] = raw.extraartists ?? [];
    if (releaseType === 'master' && raw.main_release) {
      try {
        const mainResponse = await fetch(`https://api.discogs.com/releases/${raw.main_release}`, { headers: DISCOGS_HEADERS() });
        if (mainResponse.ok) {
          const mainRaw = await mainResponse.json();
          extraartists = mainRaw.extraartists ?? [];
        }
      } catch {
        // credits are optional, don't fail the whole request
      }
    }

    const detail: DiscogsReleaseDetail = {
      id: raw.id,
      title: raw.title,
      year: raw.year ?? 0,
      genres: raw.genres ?? [],
      styles: raw.styles ?? [],
      tracklist: (raw.tracklist ?? []).map((track: { position: string; title: string; duration: string }) => ({
        position: track.position,
        title: track.title,
        duration: track.duration,
      })),
      images: (raw.images ?? []).map((image: { uri: string; uri150: string; type: string }) => ({
        uri: image.uri,
        uri150: image.uri150,
        type: image.type,
      })),
      videos: (raw.videos ?? []).map((video: { uri: string; title: string }) => ({
        uri: video.uri,
        title: video.title,
      })),
      notes: raw.notes ?? '',
      extraartists: extraartists.map((artist: { name: string; role: string; id?: number }) => ({
        name: artist.name,
        role: artist.role,
        id: artist.id,
      })),
      label: (raw.labels?.[0]?.name ?? listEntry?.label ?? ''),
      format: listEntry?.format ?? '',
    };

    detailCache.set(id, { data: detail, time: Date.now() });
    return detail;
  } catch (error) {
    console.error('Error fetching Discogs release detail:', error);
    return null;
  }
}
