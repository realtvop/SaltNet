import { $fetch, FetchError } from 'ofetch';
import type { MusicDataResponse } from '~/divingfish/type';

// Base URL for the Diving Fish API
const API_BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';
const MUSIC_DATA_ENDPOINT = `${API_BASE_URL}/music_data`;

// Simple in-memory cache
let cachedMusicData: MusicDataResponse | null = null;
let cachedEtag: string | null = null;

/**
 * Fetches music data from Diving Fish API, using a simple in-memory cache
 * and ETag for validation.
 *
 * @returns A promise that resolves with the music data array.
 * @throws Throws an error if fetching fails and no valid cache is available.
 */
export async function getCachedMusicData(): Promise<MusicDataResponse> {
  const headers: HeadersInit = {};
  if (cachedEtag) {
    // IMPORTANT: ETag value needs to be wrapped in double quotes as per HTTP spec and docs
    // Ensure quotes aren't duplicated if already present
    const etagValue = cachedEtag.startsWith('"') ? cachedEtag : `"${cachedEtag}"`;
    headers['If-None-Match'] = etagValue;
  }

  try {
    const response = await $fetch.raw<MusicDataResponse>(MUSIC_DATA_ENDPOINT, {
      method: 'GET',
      headers,
    });

    // Successfully fetched new data (status 200)
    const newEtag = response.headers.get('etag'); // Keep quotes if present
    if (newEtag) {
      cachedEtag = newEtag;
    } else {
       console.warn('Music data response missing ETag.');
    }

    // Ensure the fetched data is an array before caching and returning
    if (!Array.isArray(response._data)) {
        console.error('Fetched music data is not an array:', response._data);
        throw new Error('Invalid music data format received from API.');
    }
    cachedMusicData = response._data;
    return cachedMusicData;

  } catch (error) {
    // Check if it's a 304 Not Modified error
    if (error instanceof FetchError && error.response?.status === 304) {
      if (Array.isArray(cachedMusicData)) {
        return cachedMusicData; // Return valid cached data
      } else {
        console.error('ETag matched (304) but cached music data is invalid or missing. Forcing refetch.');
        cachedEtag = null; // Clear ETag to force refetch next time
        try {
            const freshData = await $fetch<MusicDataResponse>(MUSIC_DATA_ENDPOINT, { method: 'GET' });
            if (!Array.isArray(freshData)) {
                 throw new Error('Invalid music data format received on forced refetch.');
            }
            cachedMusicData = freshData; // Update cache
            return cachedMusicData;
        } catch (refetchError) {
             console.error('Forced refetch after 304 failed:', refetchError);
             throw new Error(`Failed to fetch music data after cache inconsistency. ${refetchError instanceof Error ? refetchError.message : String(refetchError)}`);
        }
      }
    }

    // Handle other fetch errors (non-304 status, network errors, etc.)
    console.error('Failed to fetch music data:', error);

    // If cache exists and is valid, return it as a fallback
    if (Array.isArray(cachedMusicData)) {
        console.warn('Returning stale music data due to fetch error.');
        return cachedMusicData; // Return stale but valid array data
    }

    // If no valid cache, throw a clear error
    throw new Error(`Failed to fetch music data and no valid cache available. ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Creates a Map for quick lookup of song_id to is_new status.
 * @param musicData - The array of music info. Must be an array.
 * @returns A Map where keys are song_ids (number) and values are booleans (is_new).
 */
export function createIsNewLookup(musicData: MusicDataResponse): Map<number, boolean> {
  if (!Array.isArray(musicData)) {
      console.error('createIsNewLookup received non-array input:', musicData);
      return new Map<number, boolean>();
  }
  const lookup = new Map<number, boolean>();
  for (const song of musicData) {
    const songIdNum = parseInt(song.id, 10);
    if (!isNaN(songIdNum) && song.basic_info) {
      lookup.set(songIdNum, song.basic_info.is_new);
    }
  }
  return lookup;
}
