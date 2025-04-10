import { FCStatus, FSStatus } from './maiTypes'

// API error responses
export interface DivingFishApiError {
  message: string // For 400 Bad Request
  status?: string // For 403 Forbidden
  msg?: string // For 403 Forbidden
}

// Music chart data from DivingFish API
export interface DivingFishMusicChart {
  // Score and rating info
  achievements: number // Achievement percentage (0-100.5)
  ra: number // Rating value calculated from difficulty and achievement
  dxScore: number // DX score points
  rate: string // Letter grade (e.g. SSS+, SS, S)

  // Chart details
  ds: number // Chart difficulty stars
  level: string // Difficulty level (e.g. "13+")
  level_index: number // Internal difficulty value
  level_label: string // Difficulty label

  // Song info
  song_id: number
  title: string
  type: string // Standard or DX chart

  // Clear status
  fc: FCStatus // Full combo status
  fs: FSStatus // Full sync status
}

// Successful response from DivingFish API
export interface DivingFishResponse {
  // User info
  username: string // maimai DX NET username
  nickname: string // In-game display name
  user_id: unknown | null // Player ID
  user_data: unknown | null // Additional user data

  // Rating info
  rating: number // Current rating
  additional_rating: number // Additional rating points
  plate: string // Current name plate

  // Best 50 charts
  charts: {
    dx: Array<DivingFishMusicChart> // DX chart scores
    sd: Array<DivingFishMusicChart> // Standard chart scores
  }
}