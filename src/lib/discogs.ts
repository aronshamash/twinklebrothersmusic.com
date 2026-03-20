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
    // Collect masters and individual releases separately, merging across artist IDs
    const masterEntries = new Map<number, DiscogsApiRelease>(); // master_id -> master entry
    const releaseBuckets = new Map<number, DiscogsApiRelease[]>(); // master_id -> individual releases
    const standalones: DiscogsApiRelease[] = [];
    const standaloneIds = new Set<number>();

    const artistIds = [artistId, '370148']; // Twinkle Brothers + Norman Grant

    for (const aid of artistIds) {
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const url = `https://api.discogs.com/artists/${aid}/releases?sort=year&sort_order=asc&per_page=100&page=${page}`;
        const response = await fetch(url, { headers: DISCOGS_HEADERS() });

        if (!response.ok) {
          console.error(`Discogs API error (artist ${aid}): ${response.status} ${response.statusText}`);
          break;
        }

        const data: DiscogsApiResponse = await response.json();
        totalPages = data.pagination.pages;

        for (const release of data.releases) {
          if (release.role !== 'Main') continue;
          if (release.type === 'master') {
            if (!masterEntries.has(release.id)) masterEntries.set(release.id, release);
          } else if (release.master_id) {
            if (!releaseBuckets.has(release.master_id)) releaseBuckets.set(release.master_id, []);
            releaseBuckets.get(release.master_id)!.push(release);
          } else if (!standaloneIds.has(release.id)) {
            standalones.push(release);
            standaloneIds.add(release.id);
          }
        }

        page++;
      }
    }

    // Format priority: prefer LP/Album over single when multiple releases exist per master
    function formatScore(fmt: string): number {
      const f = fmt.toLowerCase();
      if (f.includes('album')) return 4;
      if (f.includes('lp')) return 3;
      if (f.includes('cd')) return 2;
      if (f.includes('ep') || f.includes('mini')) return 1;
      return 0;
    }

    const releases: DiscogsRelease[] = [];

    for (const [masterId, masterEntry] of masterEntries) {
      const bucket = releaseBuckets.get(masterId);
      if (bucket?.length) {
        // Use the individual release with the best format
        const best = bucket.reduce((prev, curr) =>
          formatScore(curr.format ?? '') > formatScore(prev.format ?? '') ? curr : prev
        );
        releases.push({
          id: best.id,
          master_id: masterId,
          title: best.title,
          year: best.year ?? 0,
          label: best.label ?? '',
          thumb: best.thumb ?? '',
          type: best.type,
          format: best.format ?? '',
          release_type: 'release',
        });
      } else {
        // No individual releases visible — fall back to master entry
        releases.push({
          id: masterEntry.id,
          master_id: masterId,
          title: masterEntry.title,
          year: masterEntry.year ?? 0,
          label: masterEntry.label ?? '',
          thumb: masterEntry.thumb ?? '',
          type: masterEntry.type,
          format: masterEntry.format ?? '',
          release_type: 'master',
        });
      }
    }

    for (const release of standalones) {
      const fmt = (release.format ?? '').toLowerCase();
      if (fmt.includes('lp') || fmt.includes('album') || fmt.includes('comp')) continue;
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

    // Sort by year ascending
    releases.sort((a, b) => (a.year || 9999) - (b.year || 9999));

    cachedReleases = releases;
    cacheTime = Date.now();

    return releases;
  } catch (error) {
    console.error('Error fetching Discogs discography:', error);
    return [];
  }
}

export async function fetchReleaseDetail(id: number, masterId?: number, releaseType: 'master' | 'release' = 'release', coversOnly = false): Promise<DiscogsReleaseDetail | null> {
  const token = import.meta.env.DISCOGS_TOKEN;
  if (!token) return null;

  // coversOnly skips versions lookup and does not write to cache (avoids poisoning detail cache with incomplete data)
  if (!coversOnly) {
    const cached = detailCache.get(id);
    if (cached && Date.now() - cached.time < CACHE_DURATION) {
      return cached.data;
    }
  }

  try {
    const endpoint = releaseType === 'master'
      ? `https://api.discogs.com/masters/${id}`
      : `https://api.discogs.com/releases/${id}`;
    const response = await fetch(endpoint, { headers: DISCOGS_HEADERS() });

    if (!response.ok) {
      console.error(`Discogs release fetch error (${id}): ${response.status}`);
      return null;
    }

    const raw = await response.json();
    const listEntry = cachedReleases?.find(r => r.id === id);

    // For master entries on full detail requests, fetch the earliest individual release for richer data
    let richRaw = raw;
    if (releaseType === 'master' && !coversOnly) {
      try {
        const versionsResponse = await fetch(
          `https://api.discogs.com/masters/${id}/versions?sort=released&sort_order=asc&per_page=5`,
          { headers: DISCOGS_HEADERS() }
        );
        if (versionsResponse.ok) {
          const versionsData = await versionsResponse.json();
          const firstVersion = versionsData.versions?.[0];
          if (firstVersion?.id) {
            const firstReleaseResponse = await fetch(`https://api.discogs.com/releases/${firstVersion.id}`, { headers: DISCOGS_HEADERS() });
            if (firstReleaseResponse.ok) richRaw = await firstReleaseResponse.json();
          }
        }
      } catch {
        // fall back to master data
      }
    }

    // Fetch videos from master if available (releases don't always carry videos)
    let videos: { uri: string; title: string }[] = raw.videos ?? richRaw.videos ?? [];
    const masterIdToUse = masterId ?? listEntry?.master_id ?? raw.master_id ?? (releaseType === 'master' ? id : undefined);
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
      year: raw.year ?? richRaw.year ?? 0,
      genres: raw.genres ?? richRaw.genres ?? [],
      styles: raw.styles ?? richRaw.styles ?? [],
      tracklist: (richRaw.tracklist ?? raw.tracklist ?? []).map((track: { position: string; title: string; duration: string }) => ({
        position: track.position,
        title: track.title,
        duration: track.duration,
      })),
      images: ((richRaw.images?.length ? richRaw.images : raw.images) ?? []).map((image: { uri: string; uri150: string; type: string }) => ({
        uri: image.uri,
        uri150: image.uri150,
        type: image.type,
      })),
      videos: videos.map((video: { uri: string; title: string }) => ({
        uri: video.uri,
        title: video.title,
      })),
      notes: richRaw.notes ?? raw.notes ?? '',
      extraartists: (richRaw.extraartists ?? raw.extraartists ?? []).map((artist: { name: string; role: string; id?: number }) => ({
        name: artist.name,
        role: artist.role,
        id: artist.id,
      })),
      label: (richRaw.labels?.[0]?.name ?? raw.labels?.[0]?.name ?? listEntry?.label ?? ''),
      format: (richRaw.formats?.[0] ?? raw.formats?.[0])
        ? (() => { const f = richRaw.formats?.[0] ?? raw.formats?.[0]; return [f.name, ...(f.descriptions ?? [])].join(', '); })()
        : (listEntry?.format ?? ''),
    };

    if (!coversOnly) detailCache.set(id, { data: detail, time: Date.now() });
    return detail;
  } catch (error) {
    console.error('Error fetching Discogs release detail:', error);
    return null;
  }
}
