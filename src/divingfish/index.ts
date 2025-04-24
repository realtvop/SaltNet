import type { DivingFishResponse } from './type';

const API_BASE_URL = "https://www.diving-fish.com/api/maimaidxprober";

// Function to fetch player data (b50, simplified info) using /query/player (no auth required)
export const fetchPlayerData = async (username: string): Promise<DivingFishResponse> => {
  // /query/player expects b50 as a non-empty value to return b50 instead of b40
  const requestBody = {
    username: username,
    b50: "1"
  };

  try {
    const response = await fetch(`${API_BASE_URL}/query/player`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('user not exists');
      }
      // 400: user not found, 403: privacy/consent
      const err = await response.json().catch(() => ({}));
      if (err && err.message) throw new Error(err.message);
      throw new Error(`Request failed with status code ${response.status}`);
    }
    const data: DivingFishResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching player data:", error);
    throw error;
  }
};

// Function to fetch full player data using Developer-Token (for advanced features)
export const fetchPlayerFullData = async (username: string, developerToken: string): Promise<DivingFishResponse> => {
  const url = `${API_BASE_URL}/dev/player/records?username=${encodeURIComponent(username)}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Developer-Token': developerToken,
      },
    });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('user not exists');
      }
      const err = await response.json().catch(() => ({}));
      if (err && err.message) throw new Error(err.message);
      throw new Error(`Request failed with status code ${response.status}`);
    }
    const data: DivingFishResponse = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching full player data:", error);
    throw error;
  }
}
