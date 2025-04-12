import { $fetch } from 'ofetch';
import type { DivingFishResponse, DivingFishFullRecord, DivingFishErrorResponse } from './type';

// Base URL for the Diving Fish API
const API_BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';

// Retrieve Developer Token from environment variables
const DEVELOPER_TOKEN = process.env.DIVING_FISH_DEV_TOKEN;

// Determine if running in a production-like environment (Vercel sets NODE_ENV to 'production')
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Fetches full player data from the Diving Fish API using /dev/player/records
 * and calculates B50.
 * @param username - The player's username.
 * @returns A promise that resolves with the player data including calculated B50.
 * @throws Throws an error if the fetch fails, the user is not found, or the token is missing.
 */
export async function getDivingFishData(username: string): Promise<DivingFishResponse> {
  // Check if the token is missing
  if (!DEVELOPER_TOKEN) {
    const errorMessage = 'Diving Fish Developer Token (DIVING_FISH_DEV_TOKEN) is not configured in environment variables.';
    if (isProduction) {
      // In production (like Vercel), throw an error immediately.
      console.error(errorMessage);
      throw new Error('Server configuration error: Missing API token.');
    } else {
      // In development, log a warning but allow proceeding (might fail later).
      console.warn(errorMessage + ' API calls may fail.');
      // Optionally, you could throw here too for stricter local development:
      // throw new Error(errorMessage);
    }
  }

  const endpoint = `${API_BASE_URL}/dev/player/records`;
  const queryParams = { username }; // Use username to query

  try {
    // Fetch full records using /dev/player/records
    const responseData = await $fetch<DivingFishResponse | DivingFishErrorResponse>(endpoint, {
      method: 'GET',
      query: queryParams,
      headers: {
        // Include Developer-Token. If it was missing, the check above might have already thrown.
        // If running locally without throwing, this might send an undefined header, which is okay.
        ...(DEVELOPER_TOKEN && { 'Developer-Token': DEVELOPER_TOKEN }),
      },
      // Consider adding timeout
      // timeout: 10000, // 10 seconds
    });

    // Type guard to check for error response
    if ('message' in responseData && !('records' in responseData)) {
       if ((responseData as DivingFishErrorResponse).message === 'no such user') {
         // Throw a specific error for user not found
         throw new Error('user not exists');
       }
       // Throw a generic error for other API errors
       throw new Error((responseData as DivingFishErrorResponse).message || 'Failed to fetch player data');
    }

    // Cast to the success response type
    const fullData = responseData as DivingFishResponse;

    // --- B50 Calculation ---
    const records = fullData.records || [];

    // Separate records by type
    const dxRecords = records.filter(record => record.type === 'DX');
    const sdRecords = records.filter(record => record.type === 'SD');

    // Sort by rating (ra) descending
    dxRecords.sort((a, b) => b.ra - a.ra);
    sdRecords.sort((a, b) => b.ra - a.ra);

    // Get top 15 DX and top 35 SD
    const bestDx = dxRecords.slice(0, 15);
    const bestSd = sdRecords.slice(0, 35);

    // Attach calculated B50 to the response data
    fullData.b50 = {
      dx: bestDx,
      sd: bestSd,
    };
    // --- End B50 Calculation ---

    return fullData;

  } catch (error: any) {
    console.error(`Error fetching Diving Fish data for ${username}:`, error);

    // Re-throw specific errors or a generic one
    if (error.message === 'user not exists') {
      throw error; // Propagate the specific error
    }
    // Handle potential network errors or other issues from $fetch
    if (error.response?._data?.message) {
       if (error.response._data.message === 'no such user') {
         throw new Error('user not exists');
       }
       throw new Error(error.response._data.message);
    }
    // Throw a generic error if no specific message is available
    throw new Error(`Failed to fetch player data for ${username}. ${error.message || ''}`.trim());
  }
}
