import { getDivingFishData } from '~/divingfish';
import type { DivingFishResponse, DivingFishFullRecord, MusicDataResponse } from '~/divingfish/type';
import { getCachedMusicData, createIsNewLookup } from '~/server/utils/musicData';

// Define the structure of the data returned by this specific API endpoint
interface PlayerApiResponse {
  name: string;
  data: DivingFishResponse | null; // data will include the calculated b50
  error?: string;
}

export default defineEventHandler(async (event): Promise<PlayerApiResponse> => {
  const name = getRouterParam(event, 'name');
  const decodedName = name ? decodeURI(name) : '';
  const logPrefix = `[API /player/${decodedName}]`;

  if (!decodedName) {
    event.node.res.statusCode = 400;
    return { name: '', data: null, error: 'Player name is required.' };
  }

  try {
    // Fetch raw player data (without B50) and music data concurrently
    const [playerDataRaw, musicData] = await Promise.all([
      getDivingFishData(decodedName),
      getCachedMusicData() // Fetch music data using the cached utility
    ]);

    // Check for musicData validity
    if (!Array.isArray(musicData)) {
      console.error(`${logPrefix} Error: Fetched musicData is not an array. Cannot proceed with B50 calculation.`);
      throw new Error('Internal server error: Invalid music data received.');
    }

    // --- B50 Calculation using is_new ---
    const isNewLookup = createIsNewLookup(musicData as MusicDataResponse);

    const records = playerDataRaw.records || [];
    const newVersionRecords: DivingFishFullRecord[] = [];
    const oldVersionRecords: DivingFishFullRecord[] = [];

    for (const record of records) {
      // Default to old if song_id not found in music data (shouldn't happen ideally)
      const isNew = isNewLookup.get(record.song_id) ?? false;
      if (isNew) {
        newVersionRecords.push(record);
      } else {
        oldVersionRecords.push(record);
      }
    }

    // Sort by rating (ra) descending
    newVersionRecords.sort((a, b) => b.ra - a.ra);
    oldVersionRecords.sort((a, b) => b.ra - a.ra);

    // Get top 15 New and top 35 Old
    const bestNew = newVersionRecords.slice(0, 15);
    const bestOld = oldVersionRecords.slice(0, 35);

    // Attach calculated B50 to the player data
    playerDataRaw.b50 = {
      dx: bestNew, // Use 'dx' key for new version scores
      sd: bestOld,  // Use 'sd' key for old version scores
    };
    // --- End B50 Calculation ---

    return {
      name: decodedName,
      data: playerDataRaw // Return the data now including calculated b50
    };

  } catch (error: any) {
    // Log the specific error on the server side
    console.error(`${logPrefix} Error processing request:`, error);

    if (error.message === 'user not exists') {
      event.node.res.statusCode = 404;
      return { name: decodedName, data: null, error: 'user not exists' };
    }

    // Handle other errors (e.g., network, token issues, music data fetch failure)
    event.node.res.statusCode = 500;
    return {
      name: decodedName,
      data: null,
      error: error.message === 'Internal server error: Invalid music data received.'
        ? error.message
        : `Failed to process player data. Server error occurred.`
    };
  }
});
