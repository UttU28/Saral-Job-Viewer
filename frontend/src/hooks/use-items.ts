import { useState, useEffect } from "react";
import type { Item, InsertItem } from "@/lib/types";

const STORAGE_KEY = "vite-dark-homepage-items";

// Load items from localStorage
function loadItems(): Item[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save items to localStorage
function saveItems(items: Item[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error("Failed to save items:", error);
  }
}

export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    try {
      const loadedItems = loadItems();
      setItems(loadedItems);
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to load items:", error);
      setIsError(true);
      setIsLoading(false);
    }

    // Listen for storage changes to sync across tabs
    const handleStorageChange = () => {
      const loadedItems = loadItems();
      setItems(loadedItems);
    };

    window.addEventListener("storage", handleStorageChange);
    // Also listen for custom events from same tab
    window.addEventListener("itemsUpdated", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("itemsUpdated", handleStorageChange);
    };
  }, []);

  return { data: items, isLoading, isError };
}

export function useCreateItem() {
  const [isPending, setIsPending] = useState(false);

  const createItem = async (newItem: InsertItem): Promise<Item> => {
    setIsPending(true);
    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      const items = loadItems();
      const newId = items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1;
      const createdItem: Item = {
        id: newId,
        ...newItem,
      };

      const updatedItems = [...items, createdItem];
      saveItems(updatedItems);
      
      // Trigger a custom event to update other hooks in the same tab
      window.dispatchEvent(new Event("itemsUpdated"));

      return createdItem;
    } finally {
      setIsPending(false);
    }
  };

  return {
    mutate: async (
      newItem: InsertItem,
      options?: {
        onSuccess?: (data: Item) => void;
        onError?: (error: Error) => void;
      }
    ) => {
      try {
        const result = await createItem(newItem);
        options?.onSuccess?.(result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Failed to create item");
        options?.onError?.(err);
      }
    },
    isPending,
  };
}
