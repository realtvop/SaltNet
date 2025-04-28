import { convertDFMusicList, type SavedMusicList } from '@/types/music';
import type { DivingFishResponse } from './type';

const API_BASE_URL = "https://www.diving-fish.com/api/maimaidxprober";

export async function fetchPlayerData(username: string): Promise<DivingFishResponse> {
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

export async function fetchMusicData(): Promise<SavedMusicList | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/music_data`);
    if (!response.ok) {
      throw new Error(`Request failed with status code ${response.status}`);
    }
    const data = await response.json();
    return convertDFMusicList(data);
  } catch (error) {
    console.error("Error fetching song data:", error);
    throw error;
  }
}