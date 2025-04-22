import { $fetch } from 'ofetch';
import type { DivingFishResponse, DivingFishErrorResponse } from './type'; // Removed DivingFishFullRecord as it's only used internally now

// Base URL for the Diving Fish API
const API_BASE_URL = 'https://www.diving-fish.com/api/maimaidxprober';

// Retrieve Developer Token from environment variables
const DEVELOPER_TOKEN = process.env.DIVING_FISH_DEV_TOKEN;

// Determine if running in a production-like environment (Vercel sets NODE_ENV to 'production')
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Fetches raw player data (including records) from the Diving Fish API using /dev/player/records.
 * B50 calculation is NOT performed here.
 * @param username - The player's username.
 * @returns A promise that resolves with the raw player data.
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

    // Cast to the success response type - B50 is not calculated here.
    const rawData = responseData as DivingFishResponse;

    // --- B50 Calculation Removed ---

    return rawData; // Return raw data without B50

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
