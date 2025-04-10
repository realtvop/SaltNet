import { getDivingFishData } from '~/divingfish';

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name') || 'realtvop';
  const decodedName = decodeURI(name);
  
  try {
    const data = await getDivingFishData(decodedName);
    return { 
      name: decodedName,
      data
    };
  } catch (error) {
    console.error('Error fetching player data:', error);
    return { 
      name: decodedName,
      data: null,
      error: 'Failed to fetch player data'
    };
  }
});
