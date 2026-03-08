import { create } from 'zustand';

interface SearchStore {
  query: string;
  city: string;
  userLat: number | null;
  userLng: number | null;
  setQuery: (q: string) => void;
  setCity: (c: string) => void;
  setLocation: (lat: number, lng: number) => void;
}

export const useSearchStore = create<SearchStore>((set) => ({
  query: '',
  city: 'Harare',
  userLat: null,
  userLng: null,
  setQuery: (query) => set({ query }),
  setCity: (city) => set({ city }),
  setLocation: (userLat, userLng) => set({ userLat, userLng }),
}));
