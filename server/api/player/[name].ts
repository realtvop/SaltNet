import { getDivingFishData } from '~/divingfish';
import type { DivingFishResponse } from '~/divingfish/type';

export default defineEventHandler(async (event): Promise<{ name: string; data: DivingFishResponse | null; error?: string }> => {
  const name = getRouterParam(event, 'name');
  // Ensure name is decoded and valid
  const decodedName = name ? decodeURI(name) : '';

  if (!decodedName) {
    // Handle cases where name is missing or invalid
    event.node.res.statusCode = 400; // Bad Request
    return {
      name: '',
      data: null,
      error: 'Player name is required.'
    };
  }

  try {
    const data = await getDivingFishData(decodedName);
    return {
      name: decodedName,
      data
    };
  } catch (error: any) {
    console.error(`API Error fetching player data for ${decodedName}:`, error);

    // Check for specific 'user not exists' error
    if (error.message === 'user not exists') {
      event.node.res.statusCode = 404; // Not Found
      return {
        name: decodedName,
        data: null, // Explicitly return null for data
        error: 'user not exists' // Send specific error message
      };
    }

    // Handle other errors (e.g., network, token issues, other API errors)
    event.node.res.statusCode = 500; // Internal Server Error
    return {
      name: decodedName,
      data: null,
      // Provide a generic error message, potentially logging the specific one
      error: `Failed to fetch player data. ${error.message || ''}`.trim()
    };
  }
});
