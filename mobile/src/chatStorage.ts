import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoredMessage } from './db';

export interface LocalChat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

const key = (userId: string) => `smruti-local-chats:${userId}`;

export async function loadLocalChats(userId: string): Promise<LocalChat[]> {
  const raw = await AsyncStorage.getItem(key(userId));
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as LocalChat[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function saveLocalChats(userId: string, chats: LocalChat[]): Promise<void> {
  await AsyncStorage.setItem(key(userId), JSON.stringify(chats));
}

export async function clearLocalChats(userId: string): Promise<void> {
  await AsyncStorage.removeItem(key(userId));
}
