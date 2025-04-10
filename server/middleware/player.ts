import { getDivingFishData } from '~/divingfish';

export default defineEventHandler(async (event) => {
  // Get player from URL path
  const path = event.path || '';
  const pathParts = path.split('/').filter(Boolean);
  const playerFromPath = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';
  
  // Default to "realtvop" if no player specified
  const player = playerFromPath || 'realtvop';
  const decodedPlayer = decodeURI(player);
  
  try {
    // Fetch player data
    const playerData = await getDivingFishData(decodedPlayer);
    
    // Store data in event context
    event.context.player = {
      name: decodedPlayer,
      data: playerData
    };
    
    // Set the player data for the client state transfer
    // This is a more reliable approach that doesn't require useNuxtApp()
    event.context.playerData = {
      name: decodedPlayer,
      data: playerData
    };
  } catch (error) {
    console.error('Error fetching player data:', error);
    event.context.player = {
      name: decodedPlayer,
      data: null,
      error: 'Failed to fetch player data'
    };
  }
});
