import type { DivingFishResponse } from './types'

// Fetch player data from DivingFish API
export async function getDivingFishData(username: string): Promise<string | DivingFishResponse> {
    const API_URL = 'https://www.diving-fish.com/api/maimaidxprober/query/player'
    const requestOptions = {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            b50: true,
            username,
        }),
    }

    try {
        const response = await fetch(API_URL, requestOptions)
        const data: any = await response.json()
        return response.status === 200 ? data : data.message
    }
    catch (error) {
        return (error as Error).message
    }
}
