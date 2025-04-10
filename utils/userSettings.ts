/**
 * User Settings Utility
 * Manages all user settings by storing them in localStorage
 */

// Storage key prefix to avoid conflicts with other data
const STORAGE_PREFIX = 'saltweb_';

// Define settings keys and their default values
export const SETTINGS = {
    USERNAME: 'username',
    THEME: 'theme',
    LANGUAGE: 'language',
    NOTIFICATIONS: 'notifications',
};

// Define default values for settings
const DEFAULT_VALUES = {
    [SETTINGS.USERNAME]: '',
    [SETTINGS.THEME]: 'auto', // 'light', 'dark', or 'auto'
    [SETTINGS.LANGUAGE]: 'zh_CN',
    [SETTINGS.NOTIFICATIONS]: true,
};

/**
 * Get a setting value from localStorage
 * @param key - The setting key to retrieve
 * @returns The setting value or the default value if not found
 */
export function getSetting<T>(key: string): T {
    if (typeof window === 'undefined') {
        return DEFAULT_VALUES[key] as unknown as T;
    }

    try {
        const value = localStorage.getItem(STORAGE_PREFIX + key);
        if (value === null) {
            return DEFAULT_VALUES[key] as unknown as T;
        }
        return JSON.parse(value) as T;
    } catch (error) {
        console.error(`Error getting setting ${key}:`, error);
        return DEFAULT_VALUES[key] as unknown as T;
    }
}

/**
 * Save a setting value to localStorage
 * @param key - The setting key to save
 * @param value - The value to save
 */
export function setSetting<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch (error) {
        console.error(`Error saving setting ${key}:`, error);
    }
}

/**
 * Remove a setting from localStorage
 * @param key - The setting key to remove
 */
export function removeSetting(key: string): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.removeItem(STORAGE_PREFIX + key);
    } catch (error) {
        console.error(`Error removing setting ${key}:`, error);
    }
}

/**
 * Clear all settings from localStorage
 */
export function clearAllSettings(): void {
    if (typeof window === 'undefined') return;

    try {
        Object.values(SETTINGS).forEach(key => {
            localStorage.removeItem(STORAGE_PREFIX + key);
        });
    } catch (error) {
        console.error('Error clearing all settings:', error);
    }
}

/**
 * Get all user settings as an object
 * @returns An object containing all settings
 */
export function getAllSettings(): Record<string, any> {
    if (typeof window === 'undefined') {
        return { ...DEFAULT_VALUES };
    }

    try {
        const settings = { ...DEFAULT_VALUES };
        Object.values(SETTINGS).forEach(key => {
            const value = localStorage.getItem(STORAGE_PREFIX + key);
            if (value !== null) {
                settings[key] = JSON.parse(value);
            }
        });
        return settings;
    } catch (error) {
        console.error('Error getting all settings:', error);
        return { ...DEFAULT_VALUES };
    }
}