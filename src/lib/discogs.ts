export interface DiscogsRelease {
  id: number;       // individual release ID
  master_id?: number; // master ID if one exists (used for video fetching)
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
    const seenMasters = new Set<number>();
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
        if (release.type === 'master') continue; // always use individual releases for richer data

        if (release.master_id) {
          // Part of a master — use first release seen per master
          if (seenMasters.has(release.master_id)) continue;
          seenMasters.add(release.master_id);
          releases.push({
            id: release.id,
            master_id: release.master_id,
            title: release.title,
            year: release.year ?? 0,
            label: release.label ?? '',
            thumb: release.thumb ?? '',
            type: release.type,
            format: release.format ?? '',
            release_type: 'release',
          });
        } else {
          // Standalone release (no master)
          const fmt = (release.format ?? '').toLowerCase();
          const isAlbum = fmt.includes('lp') || fmt.includes('album') || fmt.includes('comp');
          if (isAlbum) continue; // standalone album pressings are usually noise
          releases.push({
            id: release.id,
            title: release.title,
            year: release.year ?? 0,
            label: release.label ?? '',
            thumb: release.thumb ?? '',
            type: release.type,
            format: release.format ?? '',
            release_type: 'release',
          });
        }
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

export async function fetchReleaseDetail(id: number, masterId?: number): Promise<DiscogsReleaseDetail | null> {
  const token = import.meta.env.DISCOGS_TOKEN;
  if (!token) return null;

  const cached = detailCache.get(id);
  if (cached && Date.now() - cached.time < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await fetch(`https://api.discogs.com/releases/${id}`, { headers: DISCOGS_HEADERS() });

    if (!response.ok) {
      console.error(`Discogs release fetch error (${id}): ${response.status}`);
      return null;
    }

    const raw = await response.json();
    const listEntry = cachedReleases?.find(r => r.id === id);

    // Fetch videos from master if available (releases don't always carry videos)
    let videos: { uri: string; title: string }[] = raw.videos ?? [];
    const masterIdToUse = masterId ?? listEntry?.master_id ?? raw.master_id;
    if (!videos.length && masterIdToUse) {
      try {
        const masterResponse = await fetch(`https://api.discogs.com/masters/${masterIdToUse}`, { headers: DISCOGS_HEADERS() });
        if (masterResponse.ok) {
          const masterRaw = await masterResponse.json();
          videos = masterRaw.videos ?? [];
        }
      } catch {
        // videos are optional
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
      videos: videos.map((video: { uri: string; title: string }) => ({
        uri: video.uri,
        title: video.title,
      })),
      notes: raw.notes ?? '',
      extraartists: (raw.extraartists ?? []).map((artist: { name: string; role: string; id?: number }) => ({
        name: artist.name,
        role: artist.role,
        id: artist.id,
      })),
      label: (raw.labels?.[0]?.name ?? listEntry?.label ?? ''),
      format: raw.formats?.[0]
        ? [raw.formats[0].name, ...(raw.formats[0].descriptions ?? [])].join(', ')
        : (listEntry?.format ?? ''),
    };

    detailCache.set(id, { data: detail, time: Date.now() });
    return detail;
  } catch (error) {
    console.error('Error fetching Discogs release detail:', error);
    return null;
  }
}
