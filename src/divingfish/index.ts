import type { DivingFishResponse } from './type';

const API_BASE_URL = "https://www.diving-fish.com/api/maimaidxprober";

// Define the structure for the API request body
interface PlayerDataRequestBody {
  username: string;
  b50?: boolean; // Optional: Assuming the API might accept this
}

// Function to fetch player data using standard fetch
export const fetchPlayerData = async (username: string): Promise<DivingFishResponse> => {
  const requestBody: PlayerDataRequestBody = {
    username: username,
    b50: true // Assuming we always want b50 data
  };

  try {
    const response = await fetch(`${API_BASE_URL}/player/profile`, { // Use standard fetch
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add any other necessary headers here
        // If a token is required, it needs to be sourced differently in the frontend
        // 'Authorization': `Bearer ${YOUR_TOKEN_VARIABLE}`
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Handle HTTP errors (e.g., 404 Not Found, 500 Internal Server Error)
      if (response.status === 404) {
        throw new Error('user not exists'); // Specific error for 404
      }
      throw new Error(`Request failed with status code ${response.status}`);
    }

    const data: DivingFishResponse = await response.json();

    // Optional: Check for application-level errors if the API returns 200 but indicates an error
    // if (data.error) { // Example check, adjust based on actual API response structure
    //   throw new Error(data.error);
    // }

    return data;
  } catch (error) {
    console.error("Error fetching player data:", error);
    // Re-throw the error to be caught by the calling component
    throw error;
  }
};
